// ============================================================================
// BeeHaven Office - Main Entry Point
// Ties together: Event Watcher → Office State → WebSocket Server → Voice → Relay
// ============================================================================

import { ClaudeWatcher } from './watcher.js';
import { Office } from './office.js';
import { Server } from './server.js';
import { Voice } from './voice.js';
import { Relay } from './relay.js';
import { ChatHandler } from './chat.js';

import { readFileSync, statSync } from 'fs';

const PORT = parseInt(process.env.BEEHAVEN_PORT || '3333');

// Track transcript reading position so we only send new text
let lastTranscriptSize = 0;
let lastTranscriptPath = '';

async function flushNewTranscriptText(transcriptPath: string, server: Server, voice: Voice) {
  try {
    if (transcriptPath !== lastTranscriptPath) {
      lastTranscriptPath = transcriptPath;
      // Skip to end on first encounter — only process NEW content from here
      try {
        lastTranscriptSize = statSync(transcriptPath).size;
      } catch { lastTranscriptSize = 0; }
      console.log(`[transcript] Initialized at offset ${lastTranscriptSize}`);
      return;
    }

    const stat = statSync(transcriptPath);
    if (stat.size <= lastTranscriptSize) return;

    console.log(`[transcript] Reading ${stat.size - lastTranscriptSize} new bytes`);

    // Read as Buffer and slice by byte offset to avoid unicode mismatch
    const buf = readFileSync(transcriptPath);
    const newContent = buf.slice(lastTranscriptSize).toString('utf8');
    lastTranscriptSize = stat.size;

    const newLines = newContent.trim().split('\n');
    for (const line of newLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant') {
          const content = entry.message?.content;
          let texts: string[] = [];
          if (Array.isArray(content)) {
            texts = content
              .filter((b: any) => b.type === 'text' && b.text?.trim())
              .map((b: any) => b.text.trim());
          } else if (typeof content === 'string' && content.trim()) {
            texts = [content.trim()];
          }
          for (const text of texts) {
            if (text.length > 0) {
              const displayText = text.length > 5000 ? text.slice(0, 5000) + '\n...' : text;
              console.log(`[transcript] Text (${text.length} chars): ${text.slice(0, 80)}...`);
              server.broadcastResponse({ event: 'Stop', content: displayText });

              // TTS only when client has toggled voice on
              if (server.isVoiceRequested() && voice.isEnabled()) {
                console.log(`[voice] Speaking ${text.length} chars...`);
                try {
                  const audio = await voice.speak(text);
                  if (audio) {
                    console.log(`[voice] Got ${audio.length} bytes audio`);
                    server.broadcastSpeech(audio.toString('base64'), displayText);
                  } else {
                    console.log(`[voice] speak() returned null`);
                  }
                } catch (err) {
                  console.error(`[voice] TTS failed:`, (err as Error).message);
                }
              }
            }
          }
        }
      } catch { continue; }
    }
  } catch (err) {
    console.error(`[transcript] Read failed:`, (err as Error).message);
  }
}

async function main() {
  console.log('');
  console.log('  🐝 BeeHaven Office');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Visualize Claude Code as a busy bee office');
  console.log('');

  // Initialize components
  const watcher = new ClaudeWatcher();
  const office = new Office();
  const server = new Server(PORT);
  const relay = new Relay();
  const voice = new Voice({
    enabled: !!process.env.ELEVENLABS_API_KEY,
  });

  // Give server access to voice for STT transcription and relay for building API
  server.setVoice(voice);
  server.setRelay(relay);
  server.setOffice(office);

  // Initialize recruiter chat handler (connects to processInput via Firebase)
  const chatHandler = new ChatHandler();
  server.setChatHandler(chatHandler);

  // Wire up: events → office state → broadcast + relay
  watcher.on('event', async (event) => {
    const { speechText } = office.processEvent(event);

    // Broadcast updated state to all local UI clients
    server.broadcastState(office.getState());
    server.broadcastEvent(event.hook_event_name, event.tool_name || '');

    // Forward user input to the frontend
    if (event.hook_event_name === 'UserPromptSubmit' && event.prompt) {
      server.broadcastResponse({
        event: 'UserPromptSubmit',
        content: event.prompt,
      });
    }

    // On every event, check the transcript for new assistant text + TTS
    const transcriptPath = (event as any).transcript_path as string | undefined;
    if (transcriptPath) {
      await flushNewTranscriptText(transcriptPath, server, voice);
    }

    // On Stop events, do multiple delayed re-reads — the transcript may not be
    // fully flushed when the hook fires, so the final response gets missed.
    if (event.hook_event_name === 'Stop' && lastTranscriptPath) {
      setTimeout(() => flushNewTranscriptText(lastTranscriptPath, server, voice), 300);
      setTimeout(() => flushNewTranscriptText(lastTranscriptPath, server, voice), 1000);
      setTimeout(() => flushNewTranscriptText(lastTranscriptPath, server, voice), 2500);
    }

    // Sync to Clearly cloud (debounced)
    relay.syncState(office.getState());
    relay.sendEvent(event);
  });

  // Periodic state broadcast (for animation interpolation)
  setInterval(() => {
    server.broadcastState(office.getState());
  }, 500);

  // Start everything
  await server.start();
  watcher.start();
  await relay.start();

  console.log('');
  console.log(`  Open http://localhost:${PORT} to see the office`);
  console.log('  Voice: ' + (voice.isEnabled() ? 'ON (ElevenLabs)' : 'OFF (set ELEVENLABS_API_KEY)'));
  console.log('  Chat:  ' + (chatHandler.isEnabled() ? 'ON (Recruiter Bee)' : 'OFF (no service account)'));
  console.log('  Relay: ' + (relay.isConfigured() ? 'ON (syncing to Clearly)' : 'OFF (run: npm run setup-relay)'));
  console.log('');
  console.log('  Waiting for Claude Code events...');
  console.log('  (Make sure hooks are configured - run: npm run setup-hooks)');
  console.log('');
}

main().catch(console.error);
