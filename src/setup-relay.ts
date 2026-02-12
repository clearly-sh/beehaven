#!/usr/bin/env node
// ============================================================================
// BeeHaven Office - Relay Setup (Login)
// Links BeeHaven to a Clearly account via relay token
// ============================================================================

import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Relay, CLEARLY_RELAY_URL } from './relay.js';

const CONFIG_DIR = join(homedir(), '.beehaven');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function saveRelayConfig(token: string, endpoint: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(CONFIG_FILE)) {
    try { existing = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  }
  existing.token = token;
  existing.endpoint = endpoint;
  existing.tier = 'connected';
  writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function login() {
  console.log('');
  console.log('  Link your Clearly account to unlock cloud features:');
  console.log('  cloud sync, shared team view, and synced bee skins.');
  console.log('');
  console.log('  To get your relay token:');
  console.log('  1. Open Clearly.sh and sign in');
  console.log('  2. Go to Settings > BeeHaven');
  console.log('  3. Click "Generate Relay Token"');
  console.log('  4. Copy the token and paste it below');
  console.log('');

  const existing = Relay.loadConfig();
  if (existing) {
    console.log(`  Already linked: token=${existing.token.slice(0, 8)}...`);
    console.log('');
    const overwrite = await prompt('  Replace with new token? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Keeping existing config.');
      return;
    }
    console.log('');
  }

  const token = await prompt('  Relay token: ');
  if (!token) {
    console.log('  No token provided.');
    return;
  }

  // Verify the token
  console.log('  Verifying token...');
  const relay = new Relay();
  const profile = await relay.verifyToken(token);

  if (profile) {
    saveRelayConfig(token, CLEARLY_RELAY_URL);
    console.log(`  Linked as ${profile.displayName} (${profile.subscriptionPlan})`);
    console.log('  Config saved to ~/.beehaven/config.json');
  } else {
    console.log('  Token verification failed. Check your token and try again.');
  }
  console.log('');
}

export function logout() {
  if (!existsSync(CONFIG_FILE)) {
    console.log('  Not linked to any Clearly account.');
    return;
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    delete config.token;
    delete config.endpoint;
    delete config.user;
    config.tier = 'local';
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('  Unlinked from Clearly. Local features still work.');
  } catch {
    console.log('  Failed to update config.');
  }
}

// Allow running directly: tsx src/setup-relay.ts
if (process.argv[1]?.endsWith('setup-relay.ts') || process.argv[1]?.endsWith('setup-relay.js')) {
  login().catch((err) => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}
