#!/usr/bin/env node
// ============================================================================
// BeeHaven Office - Relay Setup
// Configures the cloud relay to sync bee state to Clearly
// ============================================================================

import { createInterface } from 'readline';
import { Relay } from './relay.js';

const DEFAULT_ENDPOINT =
  'https://us-central1-clearly-e0927.cloudfunctions.net/beehiveRelay';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('');
  console.log('  🐝 BeeHaven Relay Setup');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  Connect BeeHaven to your Clearly account so your');
  console.log('  bee universe updates in real-time on the canvas.');
  console.log('');
  console.log('  To get your relay token:');
  console.log('  1. Open Clearly.sh and sign in');
  console.log('  2. Go to Settings > BeeHaven');
  console.log('  3. Click "Generate Relay Token"');
  console.log('  4. Copy the token and paste it below');
  console.log('');

  const existing = Relay.loadConfig();
  if (existing) {
    console.log(`  Current config: token=${existing.token.slice(0, 8)}...`);
    console.log(`  Endpoint: ${existing.endpoint}`);
    console.log('');
    const overwrite = await prompt('  Overwrite existing config? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Keeping existing config.');
      process.exit(0);
    }
    console.log('');
  }

  const token = await prompt('  Relay token: ');
  if (!token) {
    console.log('  No token provided. Exiting.');
    process.exit(1);
  }

  const endpointInput = await prompt(
    `  Endpoint (Enter for default): `
  );
  const endpoint = endpointInput || DEFAULT_ENDPOINT;

  Relay.saveConfig({ token, endpoint });

  console.log('');
  console.log('  Config saved to ~/.beehaven/config.json');
  console.log('');

  // Test the connection
  console.log('  Testing connection...');
  const relay = new Relay();
  const ok = await relay.start();

  if (relay.isConfigured()) {
    console.log('  Setup complete! Relay will activate on next `npm run dev`.');
  } else {
    console.log('  Warning: Could not verify connection. Check your token.');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
