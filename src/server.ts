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
import { spawn } from 'child_process';
import type { OfficeState, WSMessage, OnboardingConfig } from './types.js';
import { Voice } from './voice.js';
import { Relay, CLEARLY_RELAY_URL } from './relay.js';
import { Office } from './office.js';

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

  /** Set the Office state engine */
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

      saveOnboardingConfig({ token, endpoint: CLEARLY_RELAY_URL });
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

    // ---- Account Linking Routes ----

    // GET /api/account — Current Clearly account state
    this.app.get('/api/account', (_req, res) => {
      const config = loadOnboardingConfig();
      const profile = this.relay?.getProfile() || config.user || null;
      res.json({
        linked: !!(config.token && config.endpoint),
        profile,
        tier: this.relay?.getTier() || config.tier || 'local',
        connected: this.relay?.isConnected() || false,
      });
    });

    // POST /api/account/link — Link a Clearly account with relay token
    this.app.post('/api/account/link', async (req, res) => {
      const { token } = req.body;
      if (!token || typeof token !== 'string' || token.length < 32) {
        res.status(400).json({ error: 'Invalid token — must be at least 32 characters' });
        return;
      }

      if (!this.relay) {
        res.status(500).json({ error: 'Relay not initialized' });
        return;
      }

      try {
        const profile = await this.relay.verifyToken(token);
        if (!profile) {
          res.status(401).json({ error: 'Token verification failed — check your token and try again' });
          return;
        }

        saveOnboardingConfig({
          token,
          endpoint: CLEARLY_RELAY_URL,
          tier: 'connected',
          user: profile,
        });

        this.relay.configure(token, CLEARLY_RELAY_URL);
        await this.relay.start();

        console.log(`[account] Linked to Clearly as ${profile.displayName} (${profile.subscriptionPlan})`);
        res.json({ ok: true, profile });
      } catch (err) {
        console.error('[account] Link failed:', (err as Error).message);
        res.status(500).json({ error: 'Failed to link account' });
      }
    });

    // POST /api/account/unlink — Unlink Clearly account
    this.app.post('/api/account/unlink', (_req, res) => {
      if (this.relay) {
        this.relay.unconfigure();
      }

      const config = loadOnboardingConfig();
      const cleanConfig: OnboardingConfig = {
        onboarded: config.onboarded ?? true,
        tier: 'local',
        shop: config.shop,
      };
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, JSON.stringify(cleanConfig, null, 2));

      console.log('[account] Unlinked from Clearly');
      res.json({ ok: true });
    });

    // GET /api/account/sync — Detailed sync status for UI
    this.app.get('/api/account/sync', (_req, res) => {
      if (!this.relay?.isConnected()) {
        res.json({ connected: false, sent: 0, failed: 0, lastSyncAt: 0, projects: {} });
        return;
      }
      res.json(this.relay.getSyncStatus());
    });

    // API: Save config (from onboarding wizard)
    this.app.post('/api/config', (req, res) => {
      try {
        const update = req.body as Partial<OnboardingConfig>;

        if (update.tier && !['local', 'connected', 'team'].includes(update.tier)) {
          res.status(400).json({ error: 'Invalid tier' });
          return;
        }

        if (update.token && !update.endpoint) {
          update.endpoint = CLEARLY_RELAY_URL;
        }

        saveOnboardingConfig(update);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to save config' });
      }
    });

    // API: Get PIN hash (server-persisted instead of localStorage)
    this.app.get('/api/pin', (_req, res) => {
      const config = loadOnboardingConfig();
      res.json({ pinHash: config.pinHash || null });
    });

    // API: Save PIN hash
    this.app.post('/api/pin', (req, res) => {
      const { pinHash } = req.body;
      if (typeof pinHash !== 'string' || pinHash.length !== 64) {
        res.status(400).json({ error: 'Invalid PIN hash' });
        return;
      }
      saveOnboardingConfig({ pinHash });
      res.json({ ok: true });
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
        saveOnboardingConfig({
          building: { id: 'local', name: 'BeeHaven Office', floor, desk },
        });
        res.json({ ok: true });
        return;
      }

      try {
        const ok = await this.relay.selectDesk(floor, desk);
        if (ok) {
          saveOnboardingConfig({
            building: { id: 'beehaven-tower-1', name: 'BeeHaven Tower', floor, desk },
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

      if (this.voice?.isEnabled()) {
        try {
          transcript = await this.voice.transcribe(audioBuffer);
          console.log('[server] STT transcript:', transcript);
        } catch (err) {
          console.error('[server] STT failed:', (err as Error).message);
        }
      }

      this.broadcastMessage({
        type: 'transcript',
        payload: {
          text: transcript || '(transcription unavailable)',
          audioSize: audioBuffer.length,
        },
      });

      if (transcript) {
        this.broadcastMessage({
          type: 'speech',
          payload: { text: `You: ${transcript}`, audio: null },
        });
      }

      res.json({ ok: true, transcript });
    });

    // GET /api/sessions — List saved sessions
    this.app.get('/api/sessions', (_req, res) => {
      const sessions = Office.loadSessionList();
      res.json({ sessions });
    });

    // GET /api/sessions/:id — Get a specific session
    this.app.get('/api/sessions/:id', (req, res) => {
      const session = Office.loadSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json({ session });
    });

    // WebSocket connections
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[server] Client connected (${this.clients.size} total)`);

      // Send current state immediately so client doesn't wait for periodic broadcast
      if (this.office) {
        const msg = JSON.stringify({ type: 'state', payload: this.office.getState() });
        ws.send(msg);
      }

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
          } else if (msg.type === 'user-input' && this.office) {
            const text = msg.text as string;
            const project = msg.project as string | undefined;
            if (typeof text === 'string' && text.trim()) {
              const trimmed = text.trim();

              // Add to terminal log immediately
              this.office.addTerminalEntry({
                event: 'UserPromptSubmit',
                content: trimmed,
                timestamp: new Date().toISOString(),
                project: project,
                role: 'user',
              });
              this.broadcastState(this.office.getState());
              this.broadcastResponse({ event: 'UserPromptSubmit', content: trimmed });

              // Send to active Claude Code session
              const sessionId = this.office.getActiveSessionId(project || undefined);
              if (sessionId) {
                console.log(`[server] Sending to Claude session ${sessionId}: ${trimmed.slice(0, 80)}`);
                this.sendToClaudeSession(sessionId, trimmed);
              } else {
                console.log(`[server] No active session for project=${project}, message logged only`);
              }
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
    const payload: Record<string, unknown> = { ...state };
    if (this.relay?.isConnected()) {
      payload.syncStatus = this.relay.getSyncStatus();
    }
    this.broadcastMessage({ type: 'state', payload });
  }

  /** Broadcast event notification */
  broadcastEvent(event: string, detail: string) {
    this.broadcastMessage({ type: 'event', payload: { event, detail } });
  }

  /** Broadcast speech audio (base64 encoded) */
  broadcastSpeech(audioBase64: string, text: string, project?: string) {
    this.broadcastMessage({ type: 'speech', payload: { audio: audioBase64, text, project } });
  }

  /** Broadcast raw Claude Code response content */
  broadcastResponse(data: { event: string; tool?: string; content: string }) {
    this.broadcastMessage({ type: 'response', payload: data });
  }

  /** Whether any client has requested voice TTS */
  isVoiceRequested(): boolean {
    return this.voiceRequested;
  }

  private broadcastMessage(msg: WSMessage) {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /** Send a prompt to an active Claude Code session via CLI */
  private sendToClaudeSession(sessionId: string, text: string) {
    const child = spawn('claude', ['--resume', sessionId, '-p', text], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      console.error(`[claude] Failed to spawn:`, err.message);
      if (this.office) {
        this.office.addTerminalEntry({
          event: 'PostToolUseFailure',
          content: `Could not reach Claude: ${err.message}`,
          timestamp: new Date().toISOString(),
          role: 'error',
        });
        this.broadcastState(this.office.getState());
      }
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        console.log(`[claude] Response (${stdout.length} chars): ${stdout.trim().slice(0, 100)}...`);
        // Response will also appear via hooks/transcript scanner,
        // but add directly for immediate feedback
        const project = this.office?.getSessionProject(sessionId);
        if (this.office) {
          this.office.addTerminalEntry({
            event: 'Stop',
            content: stdout.trim(),
            timestamp: new Date().toISOString(),
            project: project,
            role: 'claude',
          });
          this.broadcastState(this.office.getState());
          this.broadcastResponse({ event: 'Stop', content: stdout.trim() });
        }
      } else if (code !== 0) {
        console.error(`[claude] Exited with code ${code}: ${stderr.trim().slice(0, 200)}`);
        if (this.office) {
          this.office.addTerminalEntry({
            event: 'PostToolUseFailure',
            content: `Claude exited with code ${code}${stderr.trim() ? ': ' + stderr.trim().slice(0, 200) : ''}`,
            timestamp: new Date().toISOString(),
            role: 'error',
          });
          this.broadcastState(this.office.getState());
        }
      }
    });
  }
}
