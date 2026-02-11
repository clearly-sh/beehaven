// ============================================================================
// BeeHaven Office - ElevenLabs Voice Integration
// TTS for speaking Claude's non-code responses
// STT for voice input
// ============================================================================

import { EventEmitter } from 'events';

// Dynamically import ElevenLabs to handle missing API key gracefully
let ElevenLabsClient: any = null;

const TTS_MAX_CHARS = 4000;   // ElevenLabs limit safety margin
const TTS_TIMEOUT_MS = 30000; // 30s timeout for TTS API calls
const STT_TIMEOUT_MS = 15000; // 15s timeout for STT API calls

interface VoiceConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  enabled?: boolean;
}

export class Voice extends EventEmitter {
  private client: any = null;
  private voiceId: string;
  private modelId: string;
  private enabled: boolean;
  private ready: Promise<void>;

  constructor(config: VoiceConfig = {}) {
    super();
    this.voiceId = config.voiceId || 'Z3R5wn05IrDiVCyEkUrK'; // Arabella voice
    this.modelId = config.modelId || 'eleven_flash_v2_5';
    this.enabled = config.enabled ?? true;

    if (!this.enabled) {
      console.log('[voice] Voice disabled');
      this.ready = Promise.resolve();
      return;
    }

    this.ready = this.initClient(config.apiKey);
  }

  private async initClient(apiKey?: string) {
    const key = apiKey || process.env.ELEVENLABS_API_KEY;
    if (!key) {
      console.log('[voice] No ELEVENLABS_API_KEY set - voice disabled');
      console.log('[voice] Set ELEVENLABS_API_KEY env var or pass apiKey in config to enable');
      this.enabled = false;
      return;
    }

    try {
      const mod = await import('@elevenlabs/elevenlabs-js');
      ElevenLabsClient = mod.ElevenLabsClient;
      this.client = new ElevenLabsClient({ apiKey: key });
      console.log('[voice] ElevenLabs connected');
    } catch (err) {
      console.log('[voice] Failed to init ElevenLabs:', (err as Error).message);
      console.log('[voice] Run: cd beehaven && npm install');
      this.enabled = false;
    }
  }

  /** Speak text via TTS. Returns audio buffer for browser playback. */
  async speak(text: string): Promise<Buffer | null> {
    // Wait for client initialization (fixes race with async import)
    await this.ready;
    if (!this.enabled || !this.client) return null;

    // Strip code blocks and technical content
    let cleanText = this.stripCode(text);
    if (!cleanText || cleanText.length < 5) return null;

    // Cap text length for ElevenLabs API limits
    if (cleanText.length > TTS_MAX_CHARS) {
      cleanText = cleanText.slice(0, TTS_MAX_CHARS) + '...';
    }

    try {
      const audioBuffer = await this.ttsWithTimeout(cleanText);
      if (!audioBuffer) return null;

      this.emit('speech', { text: cleanText, audio: audioBuffer });
      return audioBuffer;
    } catch (err) {
      console.error('[voice] TTS error:', (err as Error).message);
      return null;
    }
  }

  /** Run TTS conversion with a timeout to prevent hanging */
  private async ttsWithTimeout(text: string): Promise<Buffer | null> {
    return Promise.race([
      this.ttsConvert(text),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn('[voice] TTS timed out after ' + TTS_TIMEOUT_MS + 'ms');
          resolve(null);
        }, TTS_TIMEOUT_MS);
      }),
    ]);
  }

  /** Core TTS conversion — call API and collect stream */
  private async ttsConvert(text: string): Promise<Buffer | null> {
    const audioStream = await this.client.textToSpeech.convert(this.voiceId, {
      text,
      modelId: this.modelId,
      outputFormat: 'mp3_44100_64',
    });

    // Collect stream into buffer — handle both async iterable and ReadableStream
    const chunks: Uint8Array[] = [];

    if (Symbol.asyncIterator in audioStream) {
      // Node.js async iterable (ElevenLabs SDK v2+)
      for await (const chunk of audioStream) {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      }
    } else if (typeof audioStream.getReader === 'function') {
      // Web ReadableStream fallback
      const reader = audioStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    } else if (Buffer.isBuffer(audioStream)) {
      // Direct buffer response
      chunks.push(audioStream);
    } else {
      console.error('[voice] Unknown audio stream type:', typeof audioStream);
      return null;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalLength === 0) {
      console.warn('[voice] TTS returned empty audio');
      return null;
    }

    const buffer = Buffer.alloc(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }

  /** Transcribe audio buffer using STT */
  async transcribe(audioBuffer: Buffer): Promise<string | null> {
    // Wait for client initialization
    await this.ready;
    if (!this.enabled || !this.client) return null;

    try {
      const result = await Promise.race([
        this.client.speechToText.convert({
          file: audioBuffer,
          modelId: 'scribe_v2',
          languageCode: 'en',
        }),
        new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error('STT timed out')), STT_TIMEOUT_MS);
        }),
      ]);
      return result?.text || null;
    } catch (err) {
      console.error('[voice] STT error:', (err as Error).message);
      return null;
    }
  }

  /** Strip code blocks and technical content, keep conversational text */
  private stripCode(text: string): string {
    return (
      text
        // Remove fenced code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`[^`]+`/g, '')
        // Remove file paths
        .replace(/\/[\w\-./]+\.\w+/g, 'a file')
        // Remove URLs
        .replace(/https?:\/\/\S+/g, '')
        // Remove markdown headers
        .replace(/^#+\s+/gm, '')
        // Remove markdown formatting
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Remove markdown table rows (full lines with pipes)
        .replace(/^\|.+\|$/gm, '')
        // Remove markdown table separators (lines of dashes/pipes)
        .replace(/^\s*[-|]+\s*$/gm, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
