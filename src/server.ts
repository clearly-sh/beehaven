// ============================================================================
// BeeHaven Office - Express + WebSocket Server
// Serves the office UI and pushes real-time state updates
// ============================================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import type { OfficeState, WSMessage, OnboardingConfig, BuildingState } from './types.js';
import { Voice } from './voice.js';
import type { Relay } from './relay.js';
import type { ChatHandler } from './chat.js';
import type { Office } from './office.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_DIR = join(homedir(), '.beehaven');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadOnboardingConfig(): OnboardingConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { onboarded: false, tier: 'local' };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { onboarded: false, tier: 'local' };
  }
}

function saveOnboardingConfig(config: Partial<OnboardingConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadOnboardingConfig();
  const merged = { ...existing, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export class Server {
  private app = express();
  private httpServer = createServer(this.app);
  private wss = new WebSocketServer({ server: this.httpServer });
  private clients = new Set<WebSocket>();
  private voice: Voice | null = null;
  private relay: Relay | null = null;
  private chatHandler: ChatHandler | null = null;
  private office: Office | null = null;
  private voiceRequested = false;

  /** Set the Voice instance for STT transcription */
  setVoice(voice: Voice) {
    this.voice = voice;
  }

  /** Set the Relay instance for building API proxying */
  setRelay(relay: Relay) {
    this.relay = relay;
  }

  /** Set the ChatHandler for recruiter bee chat */
  setChatHandler(handler: ChatHandler) {
    this.chatHandler = handler;
  }

  /** Set the Office state engine for recruiter updates */
  setOffice(office: Office) {
    this.office = office;
  }

  constructor(private port = 3333) {
    const publicDir = join(__dirname, '..', 'public');

    this.app.use(express.json());

    // ---- Onboarding Routes ----

    // Root: serve onboarding or office based on config
    this.app.get('/', (req, res) => {
      const config = loadOnboardingConfig();
      if (config.onboarded) {
        res.sendFile(join(publicDir, 'index.html'));
      } else {
        res.sendFile(join(publicDir, 'onboarding.html'));
      }
    });

    // Auth callback: receives token from Clearly OAuth redirect
    this.app.get('/auth/callback', (req, res) => {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).send('Missing token');
        return;
      }

      // Save token to config
      saveOnboardingConfig({
        token,
        endpoint: 'https://us-central1-clearly-e0927.cloudfunctions.net/beehiveRelay',
      });

      // Redirect back to onboarding step 4 (building picker)
      res.redirect(`/onboarding.html?step=4&token=${encodeURIComponent(token)}`);
    });

    // API: Get current status
    this.app.get('/api/status', (_req, res) => {
      const config = loadOnboardingConfig();
      res.json({
        onboarded: config.onboarded,
        tier: config.tier,
        connected: !!(config.token && config.endpoint),
        building: config.building || null,
        user: config.user || null,
      });
    });

    // API: Save config (from onboarding wizard)
    this.app.post('/api/config', (req, res) => {
      try {
        const update = req.body as Partial<OnboardingConfig>;

        // Validate tier
        if (update.tier && !['local', 'connected', 'team'].includes(update.tier)) {
          res.status(400).json({ error: 'Invalid tier' });
          return;
        }

        // If token provided, also set default endpoint
        if (update.token && !update.endpoint) {
          update.endpoint = 'https://us-central1-clearly-e0927.cloudfunctions.net/beehiveRelay';
        }

        saveOnboardingConfig(update);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to save config' });
      }
    });

    // API: Get building state (proxy to relay)
    this.app.get('/api/building', async (_req, res) => {
      if (!this.relay) {
        res.json({ building: null, error: 'No relay configured' });
        return;
      }

      try {
        const building = await this.relay.getBuilding();
        res.json({ building });
      } catch {
        res.json({ building: null, error: 'Failed to fetch building' });
      }
    });

    // API: Claim a desk (proxy to relay)
    this.app.post('/api/building/select', async (req, res) => {
      const { floor, desk } = req.body;

      if (typeof floor !== 'number' || typeof desk !== 'number') {
        res.status(400).json({ error: 'floor and desk must be numbers' });
        return;
      }

      if (!this.relay) {
        // Local mode: just save to config without relay
        saveOnboardingConfig({
          building: {
            id: 'local',
            name: 'BeeHaven Office',
            floor,
            desk,
          },
        });
        res.json({ ok: true });
        return;
      }

      try {
        const ok = await this.relay.selectDesk(floor, desk);
        if (ok) {
          // Save building assignment to local config too
          const config = loadOnboardingConfig();
          saveOnboardingConfig({
            building: {
              id: 'beehaven-tower-1',
              name: 'BeeHaven Tower',
              floor,
              desk,
            },
          });
          res.json({ ok: true });
        } else {
          res.json({ ok: false, error: 'Desk unavailable — try another' });
        }
      } catch {
        res.json({ ok: false, error: 'Failed to claim desk' });
      }
    });

    // Serve static files (AFTER route handlers so / goes to our handler)
    this.app.use(express.static(publicDir));

    // API endpoint for voice transcription upload — uses ElevenLabs STT
    this.app.post('/api/transcribe', express.raw({ type: 'audio/*', limit: '10mb' }), async (req, res) => {
      const audioBuffer = req.body as Buffer;
      if (!audioBuffer || audioBuffer.length === 0) {
        res.status(400).json({ error: 'No audio data' });
        return;
      }

      let transcript: string | null = null;

      // Transcribe using ElevenLabs STT if voice is configured
      if (this.voice?.isEnabled()) {
        try {
          transcript = await this.voice.transcribe(audioBuffer);
          console.log('[server] STT transcript:', transcript);
        } catch (err) {
          console.error('[server] STT failed:', (err as Error).message);
        }
      }

      // Broadcast transcript to all connected clients
      this.broadcastMessage({
        type: 'transcript',
        payload: {
          text: transcript || '(transcription unavailable)',
          audioSize: audioBuffer.length,
        },
      });

      // Also broadcast as speech subtitle
      if (transcript) {
        this.broadcastMessage({
          type: 'speech',
          payload: { text: `You: ${transcript}`, audio: null },
        });
      }

      res.json({ ok: true, transcript });

      // Forward transcript to recruiter chat (async, after response sent)
      if (transcript && this.chatHandler) {
        this.handleRecruiterChat(transcript).catch(err => {
          console.error('[server] Chat forwarding failed:', (err as Error).message);
        });
      }
    });

    // ---- Recruiter Chat Routes ----

    // POST /api/chat — Send text to processInput, get AI response
    this.app.post('/api/chat', express.json(), async (req, res) => {
      const { text, projectId } = req.body;
      if (!text) {
        res.status(400).json({ error: 'No text provided' });
        return;
      }

      if (!this.chatHandler?.isEnabled()) {
        res.status(503).json({ error: 'Chat not available (Firebase not configured)' });
        return;
      }

      try {
        const response = await this.handleRecruiterChat(text, projectId);
        res.json({ ok: true, response });
      } catch (err) {
        console.error('[server] Chat error:', (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // GET /api/projects — Fetch projects for project picker
    this.app.get('/api/projects', async (_req, res) => {
      if (!this.chatHandler?.isEnabled()) {
        res.json({ projects: [] });
        return;
      }

      try {
        const projects = await this.chatHandler.fetchProjects();
        res.json({ projects });
      } catch (err) {
        res.json({ projects: [], error: (err as Error).message });
      }
    });

    // POST /api/create-agent — Generate agent script from template
    this.app.post('/api/create-agent', express.json(), async (req, res) => {
      const { name, description, targetFiles, conversationContext } = req.body;
      if (!name || !description) {
        res.status(400).json({ error: 'name and description required' });
        return;
      }

      if (!this.chatHandler) {
        res.status(503).json({ error: 'Chat handler not available' });
        return;
      }

      try {
        // Update recruiter state
        this.office?.updateRecruiterState('coding', 'desk', `Writing ${name} script...`);
        this.office && this.broadcastState(this.office.getState());

        const script = this.chatHandler.generateAgentScript({
          name,
          description,
          targetFiles: targetFiles || [],
          conversationContext: conversationContext || '',
        });

        this.office?.updateRecruiterState('presenting', 'meeting-room', `Created ${name}!`);
        this.office && this.broadcastState(this.office.getState());

        res.json({ ok: true, script });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // POST /api/create-pr — Create branch + commit + PR for agent script
    this.app.post('/api/create-pr', express.json(), async (req, res) => {
      const { scriptPath, name, description } = req.body;
      if (!scriptPath || !name) {
        res.status(400).json({ error: 'scriptPath and name required' });
        return;
      }

      if (!this.chatHandler) {
        res.status(503).json({ error: 'Chat handler not available' });
        return;
      }

      try {
        this.office?.updateRecruiterState('running-command', 'server-room', 'Creating PR...');
        this.office && this.broadcastState(this.office.getState());

        const result = this.chatHandler.createPullRequest({
          scriptPath,
          name,
          description: description || '',
        });

        this.office?.updateRecruiterState('celebrating', 'meeting-room', `PR created!`);
        this.office && this.broadcastState(this.office.getState());

        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // WebSocket connections
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[server] Client connected (${this.clients.size} total)`);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'voice-toggle') {
            this.voiceRequested = !!msg.enabled;
            console.log(`[server] Voice ${this.voiceRequested ? 'ON' : 'OFF'}`);
          } else if (msg.type === 'delete-project' && this.office) {
            const proj = msg.project;
            if (typeof proj === 'string' && proj.length > 0 && proj.length < 256) {
              this.office.removeProject(proj);
              this.broadcastState(this.office.getState());
              console.log(`[server] Deleted project: ${proj}`);
            }
          } else if (msg.type === 'shop-purchase' && this.office) {
            const itemId = msg.itemId;
            if (typeof itemId === 'string') {
              const err = this.office.shopPurchase(itemId);
              this.broadcastMessage({ type: 'shop-result', payload: { action: 'purchase', itemId, error: err } });
              if (!err) {
                saveOnboardingConfig({ shop: this.office.shopPersistData() });
              }
              this.broadcastState(this.office.getState());
            }
          } else if (msg.type === 'shop-equip' && this.office) {
            const itemId = msg.itemId;
            if (typeof itemId === 'string') {
              const err = this.office.shopEquip(itemId);
              this.broadcastMessage({ type: 'shop-result', payload: { action: 'equip', itemId, error: err } });
              if (!err) {
                saveOnboardingConfig({ shop: this.office.shopPersistData() });
              }
              this.broadcastState(this.office.getState());
            }
          }
        } catch { /* ignore */ }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[server] Client disconnected (${this.clients.size} total)`);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  /** Start the server */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`[server] BeeHaven Office running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  /** Broadcast office state to all connected clients */
  broadcastState(state: OfficeState) {
    this.broadcastMessage({ type: 'state', payload: state });
  }

  /** Broadcast event notification */
  broadcastEvent(event: string, detail: string) {
    this.broadcastMessage({ type: 'event', payload: { event, detail } });
  }

  /** Broadcast speech audio (base64 encoded) */
  broadcastSpeech(audioBase64: string, text: string) {
    this.broadcastMessage({ type: 'speech', payload: { audio: audioBase64, text } });
  }

  /** Broadcast raw Claude Code response content (tool output, stop text, etc.) */
  broadcastResponse(data: { event: string; tool?: string; content: string }) {
    this.broadcastMessage({ type: 'response' as any, payload: data });
  }

  /** Whether any client has requested voice TTS */
  isVoiceRequested(): boolean {
    return this.voiceRequested;
  }

  /** Handle recruiter chat: send to processInput, broadcast response, TTS */
  private async handleRecruiterChat(text: string, projectId?: string) {
    if (!this.chatHandler) throw new Error('Chat handler not available');

    // Update recruiter bee to thinking state
    this.office?.updateRecruiterState('thinking', 'desk', 'Hmm, let me think...');
    this.office?.setChatProcessing(true);
    this.office?.addChatMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    if (this.office) this.broadcastState(this.office.getState());

    // Broadcast processing status
    this.broadcastMessage({
      type: 'chat',
      payload: { status: 'processing', text },
    });

    try {
      const response = await this.chatHandler.processChat(text, projectId);

      const responseText = response.enhanced || response.title || response.verbatim || '';

      // Update recruiter with response
      this.office?.updateRecruiterState('presenting', 'meeting-room',
        responseText.length > 60 ? responseText.slice(0, 60) + '...' : responseText);
      this.office?.setChatProcessing(false);
      this.office?.addChatMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
      });
      if (this.office) this.broadcastState(this.office.getState());

      // Broadcast chat response
      this.broadcastMessage({
        type: 'chat',
        payload: { status: 'complete', response: responseText },
      });

      // TTS the response (only when client has toggled voice on)
      if (this.voice?.isEnabled() && this.voiceRequested && responseText) {
        const audio = await this.voice.speak(responseText);
        if (audio) {
          this.broadcastSpeech(audio.toString('base64'), `Recruiter: ${responseText}`);
        }
      }

      return response;
    } catch (err) {
      this.office?.updateRecruiterState('idle', 'meeting-room', 'Something went wrong...');
      this.office?.setChatProcessing(false);
      if (this.office) this.broadcastState(this.office.getState());
      throw err;
    }
  }

  private broadcastMessage(msg: WSMessage) {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }
}
