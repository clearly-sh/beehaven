// ============================================================================
// BeeHaven Office - Chat Handler
// Connects voice/text to processInputAgent, manages agent scripts and PRs
// ============================================================================

import { initFirebase, admin } from './firebase.js';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const SCRIPTS_DIR = resolve(PROJECT_ROOT, 'scripts', 'bees');
const TEMPLATE_PATH = resolve(SCRIPTS_DIR, '_template.ts');

// Cloud Function URLs (v2 onCall via Cloud Run)
const PROCESS_INPUT_AGENT_URL = 'https://processinputagent-qex6tv6glq-uc.a.run.app';
const PROCESS_INPUT_URL = 'https://processinput-qex6tv6glq-uc.a.run.app';
const FIREBASE_API_KEY = 'AIzaSyCPoJXCG4BJEtERrt6uyDDjoic2TJnQQUE';

// Test user (same as omni-artist-improver.ts)
const USER_ID = 'oKB2ZCc3nwXwQg5ps8AQLmLkUAA2';

interface ChatResponse {
  enhanced?: string;
  title?: string;
  description?: string;
  verbatim?: string;
  [key: string]: unknown;
}

interface ProjectInfo {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
}

interface AgentScriptResult {
  filename: string;
  filepath: string;
  name: string;
}

interface PRResult {
  branch: string;
  prUrl: string;
}

export class ChatHandler {
  private firestore: ReturnType<typeof initFirebase>;
  private conversationHistory: Array<{ role: 'user' | 'model'; content: string }> = [];
  private cachedIdToken: string | null = null;

  constructor() {
    this.firestore = initFirebase();
  }

  /** Whether chat is available (Firebase connected) */
  isEnabled(): boolean {
    return this.firestore !== null;
  }

  /** Send text to processInputAgent and get AI response */
  async processChat(text: string, projectId?: string): Promise<ChatResponse> {
    if (!this.firestore) throw new Error('Firebase not initialized');

    // Build conversation turns for context
    const conversationTurns = this.conversationHistory.slice(-10);

    // Fetch board items if project specified
    let boardItems: Array<{ id: string; title: string; status: string }> = [];
    if (projectId) {
      try {
        const snap = await this.firestore
          .collection(`users/${USER_ID}/products/${projectId}/boardItems`)
          .orderBy('updatedAt', 'desc')
          .limit(20)
          .get();
        boardItems = snap.docs.map(doc => ({
          id: doc.id,
          title: doc.data().title || '',
          status: doc.data().status || '',
        }));
      } catch {
        // Board items optional
      }
    }

    // Get Firebase ID token for auth
    const idToken = await this.getFirebaseIdToken();

    // Call processInputAgent (multi-turn agentic endpoint)
    const payload = {
      data: {
        textInput: text,
        userId: USER_ID,
        projectId: projectId || undefined,
        conversationHistory: conversationTurns,
        boardItems: boardItems.length > 0 ? boardItems : undefined,
        agentMode: 'agent',
      },
    };

    const resp = await fetch(PROCESS_INPUT_AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      // Fallback to processInput if agent endpoint fails
      console.log('[chat] processInputAgent failed, trying processInput fallback');
      return this.processChatFallback(text, idToken, projectId, boardItems);
    }

    const result = await resp.json();
    const response = (result.result || result) as ChatResponse;

    // Update conversation history
    this.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'model', content: response.enhanced || response.title || '' },
    );

    return response;
  }

  /** Fallback: call processInput (simpler, non-agentic) */
  private async processChatFallback(
    text: string,
    idToken: string,
    projectId?: string,
    boardItems?: Array<{ id: string; title: string; status: string }>,
  ): Promise<ChatResponse> {
    const sessionHistory = this.conversationHistory.slice(-10).map(m => ({
      verbatim: m.content,
      enhanced: m.content,
      title: '',
      description: '',
    }));

    const payload = {
      data: {
        textInput: text,
        userId: USER_ID,
        projectId: projectId || undefined,
        sessionHistory,
        boardItems,
      },
    };

    const resp = await fetch(PROCESS_INPUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown error');
      throw new Error(`processInput failed (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const result = await resp.json();
    const response = (result.result || result) as ChatResponse;

    this.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'model', content: response.enhanced || response.title || '' },
    );

    return response;
  }

  /** Get Firebase ID token using custom token exchange (same pattern as omni-artist-improver) */
  private async getFirebaseIdToken(): Promise<string> {
    if (this.cachedIdToken) return this.cachedIdToken;

    const customToken = await admin.auth().createCustomToken(USER_ID);

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    this.cachedIdToken = data.idToken;

    // Token expires in ~1 hour, clear cache after 50 minutes
    setTimeout(() => { this.cachedIdToken = null; }, 50 * 60 * 1000);

    return data.idToken;
  }

  /** Fetch user's projects from Firestore */
  async fetchProjects(): Promise<ProjectInfo[]> {
    if (!this.firestore) return [];

    const snap = await this.firestore
      .collection(`users/${USER_ID}/products`)
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();

    return snap.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title || 'Untitled',
      description: doc.data().description || '',
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || '',
    }));
  }

  /** Generate an agent script from the template */
  generateAgentScript(opts: {
    name: string;
    description: string;
    targetFiles: string[];
    conversationContext: string;
  }): AgentScriptResult {
    const safeName = opts.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const filename = `${safeName}.ts`;
    const filepath = resolve(SCRIPTS_DIR, filename);

    // Ensure scripts/bees/ directory exists
    mkdirSync(SCRIPTS_DIR, { recursive: true });

    // Read and fill template
    let template: string;
    if (existsSync(TEMPLATE_PATH)) {
      template = readFileSync(TEMPLATE_PATH, 'utf8');
    } else {
      template = getDefaultTemplate();
    }

    const script = template
      .replace(/\{\{AGENT_NAME\}\}/g, opts.name)
      .replace(/\{\{SAFE_NAME\}\}/g, safeName)
      .replace(/\{\{AGENT_DESCRIPTION\}\}/g, opts.description)
      .replace(/\{\{TARGET_FILES\}\}/g, JSON.stringify(opts.targetFiles, null, 2))
      .replace(/\{\{CONVERSATION_CONTEXT\}\}/g, opts.conversationContext.slice(0, 500));

    writeFileSync(filepath, script);
    console.log(`[chat] Generated agent script: ${filepath}`);

    return { filename, filepath, name: opts.name };
  }

  /** Create a git branch, commit the script, and open a PR */
  createPullRequest(opts: {
    scriptPath: string;
    name: string;
    description: string;
  }): PRResult {
    const safeBranch = opts.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const branchName = `bee-agent/${safeBranch}`;

    try {
      // Create and switch to new branch
      execSync(`git checkout -b ${branchName}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });

      // Stage the script
      execSync(`git add "${opts.scriptPath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });

      // Commit
      const commitMsg = `Add bee agent: ${opts.name}\n\n${opts.description}`;
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });

      // Push
      execSync(`git push -u origin ${branchName}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });

      // Create PR
      const prBody = `## Bee Agent: ${opts.name}\n\n${opts.description}\n\nGenerated by the BeeHaven Recruiter Bee.`;
      const prOutput = execSync(
        `gh pr create --title "Bee Agent: ${opts.name}" --body "${prBody.replace(/"/g, '\\"')}"`,
        { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: 'pipe' },
      );

      const prUrl = prOutput.trim();

      // Switch back to previous branch
      execSync('git checkout -', { cwd: PROJECT_ROOT, stdio: 'pipe' });

      return { branch: branchName, prUrl };
    } catch (err) {
      // Try to switch back to previous branch on error
      try { execSync('git checkout -', { cwd: PROJECT_ROOT, stdio: 'pipe' }); } catch {}
      throw new Error(`PR creation failed: ${(err as Error).message}`);
    }
  }
}

/** Inline fallback template if scripts/bees/_template.ts doesn't exist yet */
function getDefaultTemplate(): string {
  return `#!/usr/bin/env npx ts-node
/**
 * {{AGENT_NAME}} — BeeHaven Bee Agent
 *
 * {{AGENT_DESCRIPTION}}
 *
 * Generated by the BeeHaven Recruiter.
 *
 * Usage:
 *   npx ts-node scripts/bees/{{SAFE_NAME}}.ts
 *   npx ts-node scripts/bees/{{SAFE_NAME}}.ts --dry-run
 */

import admin from 'firebase-admin';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SERVICE_ACCOUNT_PATH = path.join(PROJECT_ROOT, 'functions', 'serviceAccountKey.json');

// Firebase init
if (!admin.apps?.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT_PATH),
    projectId: 'clearly-9bd39',
  });
}
const firestore = admin.firestore();

// BeeHaven integration
const BEE_USER_ID = 'oKB2ZCc3nwXwQg5ps8AQLmLkUAA2';
const BEE_ID = 'agent-{{SAFE_NAME}}';

const TARGET_FILES = {{TARGET_FILES}};

const DRY_RUN = process.argv.includes('--dry-run');

async function updateBee(activity: string, room: string, message: string) {
  try {
    const stateRef = firestore.doc(\`users/\${BEE_USER_ID}/beehive/state\`);
    const doc = await stateRef.get();
    const existing = doc.data();
    const bees = (existing?.bees || []).filter((b: any) => b.id !== BEE_ID);
    bees.push({
      id: BEE_ID, name: '{{AGENT_NAME}}', role: 'worker', color: '#3B82F6',
      room, activity, x: 0, y: 0, targetX: 0, targetY: 0, message,
    });
    await stateRef.set({ bees, sessionActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch {}
}

async function run() {
  console.log(\`\\n  Bee Agent: {{AGENT_NAME}}\`);
  console.log(\`  \${DRY_RUN ? '(dry run)' : '(full run)'}\\n\`);

  await updateBee('arriving', 'lobby', 'Starting up...');

  // Phase 1: Analyze
  await updateBee('reading', 'desk', 'Analyzing codebase...');
  // TODO: Add analysis logic for TARGET_FILES

  // Phase 2: Process
  if (!DRY_RUN) {
    await updateBee('coding', 'desk', 'Running improvements...');
    // TODO: Add Claude Code invocation
  }

  // Phase 3: Verify
  await updateBee('running-command', 'server-room', 'Building...');
  // TODO: Add build verification

  await updateBee('celebrating', 'lobby', 'Done!');
  console.log('  Complete!');
}

run().catch(console.error);
`;
}
