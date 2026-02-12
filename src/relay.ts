// ============================================================================
// BeeHaven Office - Cloud Relay
// Syncs local Office state to Clearly's Firestore via Cloud Function
// ============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir, hostname, platform } from 'os';
import { join } from 'path';
import type { OfficeState, ClaudeEvent, BuildingState, ClearlyProfile } from './types.js';

const CONFIG_DIR = join(homedir(), '.beehaven');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const CLEARLY_RELAY_URL = 'https://us-central1-clearly-9bd39.cloudfunctions.net/beehiveRelay';

export interface RelayConfig {
  token: string;
  endpoint: string;
}

export class Relay {
  private config: RelayConfig | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: OfficeState | null = null;
  private pendingEvents: ClaudeEvent[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private tier = 'free';
  private profile: ClearlyProfile | null = null;
  private deviceId: string;

  /** Debounce interval — batch rapid events into single writes */
  private debounceMs = 300;

  /** Exponential backoff state */
  private backoff = { delay: 1000, max: 60_000, factor: 2, attempts: 0 };

  /** Stats for logging */
  private stats = { sent: 0, failed: 0, batches: 0 };

  /** Callback when profile updates from heartbeat */
  onProfileUpdate: ((profile: ClearlyProfile) => void) | null = null;

  constructor() {
    this.config = Relay.loadConfig();
    this.deviceId = `${hostname()}-${platform()}`;
  }

  /** Load relay config from ~/.beehaven/config.json */
  static loadConfig(): RelayConfig | null {
    if (!existsSync(CONFIG_FILE)) return null;

    try {
      const raw = readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.token || !parsed.endpoint) return null;
      return { token: parsed.token, endpoint: parsed.endpoint };
    } catch {
      return null;
    }
  }

  /** Check if relay is configured with a token */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /** Whether relay is actively connected */
  isConnected(): boolean {
    return this.connected;
  }

  /** Current tier from last heartbeat */
  getTier(): string {
    return this.tier;
  }

  /** User profile from last heartbeat */
  getProfile(): ClearlyProfile | null {
    return this.profile;
  }

  /** Configure relay with a new token (for account linking) */
  configure(token: string, endpoint?: string): void {
    this.config = { token, endpoint: endpoint || CLEARLY_RELAY_URL };
  }

  /** Clear relay configuration (for account unlinking) */
  unconfigure(): void {
    this.stop();
    this.config = null;
    this.profile = null;
    this.connected = false;
    this.tier = 'free';
  }

  /** Start the relay — begins heartbeat */
  async start(): Promise<void> {
    if (!this.config) return;

    // Initial heartbeat to verify token + fetch profile
    const ok = await this.sendHeartbeat();
    this.connected = ok;

    if (!ok) {
      console.log('[relay] Failed to connect — check token and endpoint');
      this.scheduleReconnect();
      return;
    }

    console.log(`[relay] Connected to Clearly (tier: ${this.tier})`);
    this.backoff.attempts = 0;

    // Heartbeat every 30s
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30_000);
  }

  /** Stop the relay */
  stop(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.heartbeatInterval = null;
    this.sendTimer = null;
    this.connected = false;
    this.flushBatch();
  }

  /** Queue a state sync (debounced) */
  syncState(state: OfficeState): void {
    if (!this.config || !this.connected) return;

    this.pendingState = state;

    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => {
      this.flushBatch();
    }, this.debounceMs);
  }

  /** Queue an event for batched sending */
  async sendEvent(event: ClaudeEvent): Promise<void> {
    if (!this.config || !this.connected) return;

    // Only relay session-level events
    const important = [
      'SessionStart',
      'SessionEnd',
      'SubagentStart',
      'SubagentStop',
      'PostToolUseFailure',
    ];
    if (!important.includes(event.hook_event_name)) return;

    this.pendingEvents.push(event);

    if (this.pendingEvents.length >= 10) {
      if (this.sendTimer) clearTimeout(this.sendTimer);
      this.flushBatch();
    }
  }

  /** Verify a token by sending a heartbeat. Returns profile on success, null on failure. */
  async verifyToken(token: string, endpoint?: string): Promise<ClearlyProfile | null> {
    const url = endpoint || CLEARLY_RELAY_URL;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: 'heartbeat', deviceId: this.deviceId }),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return null;

      const json = await resp.json() as Record<string, unknown>;
      if (!json.ok) return null;

      // Parse profile from heartbeat response
      const profile = json.profile as Record<string, unknown> | undefined;
      if (profile) {
        return {
          displayName: (profile.displayName as string) || 'Clearly User',
          photoURL: profile.photoURL as string | undefined,
          email: profile.email as string | undefined,
          subscriptionPlan: (profile.subscriptionPlan as ClearlyProfile['subscriptionPlan']) || 'free',
          subscriptionStatus: profile.subscriptionStatus as string | undefined,
        };
      }

      // Heartbeat succeeded but no profile data — return minimal profile
      return {
        displayName: 'Clearly User',
        subscriptionPlan: (json.tier as ClearlyProfile['subscriptionPlan']) || 'free',
      };
    } catch {
      return null;
    }
  }

  /** Fetch building state from the cloud relay */
  async getBuilding(): Promise<BuildingState | null> {
    if (!this.config) return null;

    try {
      const resp = await this.post('building', {});
      if (resp?.building) return resp.building as unknown as BuildingState;
      return null;
    } catch {
      return null;
    }
  }

  /** Claim a desk in the building via cloud relay */
  async selectDesk(floor: number, desk: number): Promise<boolean> {
    if (!this.config) return false;

    try {
      const resp = await this.post('claim-desk', { floor, desk });
      return resp?.ok === true;
    } catch {
      return false;
    }
  }

  // ---- Private ----

  /** Flush pending state + events as a single batch request */
  private async flushBatch(): Promise<void> {
    if (!this.config) return;
    if (!this.pendingState && this.pendingEvents.length === 0) return;

    const state = this.pendingState;
    const events = this.pendingEvents.splice(0);
    this.pendingState = null;

    if (state && events.length > 0) {
      const payload = this.serializeState(state);
      await this.post('batch', { state: payload, events });
      this.stats.batches++;
    } else if (state) {
      const payload = this.serializeState(state);
      await this.post('state', { state: payload });
    } else if (events.length > 0) {
      if (events.length === 1) {
        await this.post('event', { event: events[0] });
      } else {
        await this.post('batch', { events });
        this.stats.batches++;
      }
    }
  }

  /** Serialize office state for transmission */
  private serializeState(state: OfficeState) {
    return {
      bees: state.bees.map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        room: b.room,
        activity: b.activity,
        x: b.x,
        y: b.y,
        targetX: b.targetX,
        targetY: b.targetY,
        color: b.color,
        message: b.message,
      })),
      currentEvent: state.currentEvent,
      currentTool: state.currentTool,
      sessionActive: state.sessionActive,
      eventLog: state.eventLog.slice(0, 20),
      stats: state.stats,
    };
  }

  /** Send heartbeat and parse profile from response */
  private async sendHeartbeat(): Promise<boolean> {
    try {
      const resp = await this.post('heartbeat', { deviceId: this.deviceId });
      if (resp?.tier) this.tier = resp.tier as string;

      // Parse profile from heartbeat response
      const profileData = resp?.profile as Record<string, unknown> | undefined;
      if (profileData) {
        this.profile = {
          displayName: (profileData.displayName as string) || 'Clearly User',
          photoURL: profileData.photoURL as string | undefined,
          email: profileData.email as string | undefined,
          subscriptionPlan: (profileData.subscriptionPlan as ClearlyProfile['subscriptionPlan']) || 'free',
          subscriptionStatus: profileData.subscriptionStatus as string | undefined,
        };
        this.onProfileUpdate?.(this.profile);
      }

      return true;
    } catch {
      return false;
    }
  }

  /** Schedule reconnection with exponential backoff */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.backoff.delay * Math.pow(this.backoff.factor, this.backoff.attempts),
      this.backoff.max
    );
    this.backoff.attempts++;

    console.log(
      `[relay] Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${this.backoff.attempts})`
    );

    setTimeout(async () => {
      const ok = await this.sendHeartbeat();
      if (ok) {
        this.connected = true;
        this.backoff.attempts = 0;
        console.log(`[relay] Reconnected (tier: ${this.tier})`);

        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          this.sendHeartbeat();
        }, 30_000);
      } else {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** POST to the relay endpoint */
  private async post(
    type: 'state' | 'event' | 'heartbeat' | 'batch' | 'building' | 'claim-desk',
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.config) return null;

    try {
      const resp = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ type, ...data }),
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const body = await resp.text();
        this.stats.failed++;

        if (resp.status === 401) {
          console.error('[relay] Token rejected — re-link your Clearly account');
          this.connected = false;
        } else if (resp.status === 429) {
          console.warn(`[relay] Rate limited (tier: ${this.tier})`);
          this.debounceMs = Math.min(this.debounceMs * 2, 5000);
          setTimeout(() => {
            this.debounceMs = 300;
          }, 60_000);
        } else {
          console.error(`[relay] POST ${type} failed: ${resp.status} ${body}`);
        }
        return null;
      }

      this.stats.sent++;
      const json = await resp.json();
      return json as Record<string, unknown>;
    } catch (err: any) {
      this.stats.failed++;
      if (err.name !== 'AbortError') {
        console.error(`[relay] POST ${type} error: ${err.message}`);
      }

      if (this.stats.failed > 5 && this.connected) {
        this.connected = false;
        this.scheduleReconnect();
      }
      return null;
    }
  }
}
