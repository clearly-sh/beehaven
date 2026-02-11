// ============================================================================
// BeeHaven Office - Hook Configuration Setup
// Writes the Claude Code hooks config to .claude/settings.local.json
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');
const SETTINGS_PATH = resolve(PROJECT_ROOT, '.claude', 'settings.local.json');
const HOOK_SCRIPT = resolve(PROJECT_ROOT, 'beehaven', 'hooks', 'event-logger.sh');

function main() {
  console.log('');
  console.log('  🐝 BeeHaven Office - Hook Setup');
  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Ensure .claude directory exists
  const claudeDir = dirname(SETTINGS_PATH);
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // Read existing settings
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
      console.log('  Found existing settings.local.json');
    } catch {
      console.log('  Creating new settings.local.json');
    }
  }

  // Define hook for all relevant events
  const hookCommand = HOOK_SCRIPT;
  const hookDef = [
    {
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    },
  ];

  // Events to watch
  const events = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'Stop',
    'SessionEnd',
    'SubagentStart',
    'SubagentStop',
    'Notification',
  ];

  // Build hooks config
  const hooks: Record<string, typeof hookDef> = {};
  for (const event of events) {
    hooks[event] = hookDef;
  }

  settings.hooks = hooks;

  // Write settings
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  console.log(`  Hook script: ${hookCommand}`);
  console.log(`  Settings file: ${SETTINGS_PATH}`);
  console.log(`  Events configured: ${events.length}`);
  console.log('');
  console.log('  ✓ Hooks configured! Claude Code will now emit events to BeeHaven.');
  console.log('  Restart Claude Code for hooks to take effect.');
  console.log('');
}

main();
