// ============================================================================
// BeeHaven Office - ElevenLabs Voice Integration
// TTS for speaking Claude's non-code responses
// STT for voice input
// ============================================================================

import { EventEmitter } from 'events';

// Dynamically import ElevenLabs to handle missing API key gracefully
let ElevenLabsClient: any = null;

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
  private speaking = false;
  private queue: string[] = [];

  constructor(config: VoiceConfig = {}) {
    super();
    this.voiceId = config.voiceId || 'Z3R5wn05IrDiVCyEkUrK'; // Arabella voice
    this.modelId = config.modelId || 'eleven_flash_v2_5';
    this.enabled = config.enabled ?? true;

    if (!this.enabled) {
      console.log('[voice] Voice disabled');
      return;
    }

    this.initClient(config.apiKey);
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
    if (!this.enabled || !this.client) return null;

    // Strip code blocks and technical content
    const cleanText = this.stripCode(text);
    if (!cleanText || cleanText.length < 5) return null;

    // Queue if already speaking
    if (this.speaking) {
      this.queue.push(cleanText);
      return null;
    }

    this.speaking = true;

    try {
      const audioStream = await this.client.textToSpeech.convert(this.voiceId, {
        text: cleanText,
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
        this.speaking = false;
        return null;
      }

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalLength === 0) {
        console.warn('[voice] TTS returned empty audio');
        this.speaking = false;
        return null;
      }

      const buffer = Buffer.alloc(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      this.speaking = false;
      this.emit('speech', { text: cleanText, audio: buffer });

      // Process queue
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.speak(next);
      }

      return buffer;
    } catch (err) {
      console.error('[voice] TTS error:', (err as Error).message);
      if ((err as Error).stack) console.error('[voice] Stack:', (err as Error).stack);
      this.speaking = false;

      // Still process queue on error to prevent queue stall
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.speak(next);
      }

      return null;
    }
  }

  /** Transcribe audio buffer using STT */
  async transcribe(audioBuffer: Buffer): Promise<string | null> {
    if (!this.enabled || !this.client) return null;

    try {
      const result = await this.client.speechToText.convert({
        file: audioBuffer,
        modelId: 'scribe_v2',
        languageCode: 'en',
      });
      return result.text || null;
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
        // Remove table formatting
        .replace(/\|[^|]+\|/g, '')
        .replace(/[-|]+/g, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
