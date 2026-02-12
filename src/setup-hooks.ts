// ============================================================================
// BeeHaven Office - Hook Configuration Setup
// Writes the Claude Code hooks config to .claude/settings.local.json
// in the user's current working directory.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function setupHooks() {
  // Resolve hook script path relative to this package (not CWD)
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const hookScript = join(packageRoot, 'hooks', 'event-logger.sh');

  // Write settings to the user's project (CWD), not the package
  const projectDir = process.cwd();
  const settingsDir = resolve(projectDir, '.claude');
  const settingsPath = resolve(settingsDir, 'settings.local.json');

  console.log('');
  console.log('  \uD83D\uDC1D BeeHaven Office - Hook Setup');
  console.log('  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  console.log('');

  // Verify hook script exists
  if (!existsSync(hookScript)) {
    console.error(`  Error: Hook script not found at ${hookScript}`);
    console.error('  This may indicate a broken installation.');
    process.exit(1);
  }

  // Ensure .claude directory exists
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  // Read existing settings
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      console.log('  Found existing settings.local.json');
    } catch {
      console.log('  Creating new settings.local.json');
    }
  }

  // Define hook for all relevant events
  const hookDef = [
    {
      hooks: [
        {
          type: 'command',
          command: hookScript,
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
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log(`  Project: ${projectDir}`);
  console.log(`  Hook script: ${hookScript}`);
  console.log(`  Settings file: ${settingsPath}`);
  console.log(`  Events configured: ${events.length}`);
  console.log('');
  console.log('  Hooks configured! Claude Code will now emit events to BeeHaven.');
  console.log('  Restart Claude Code for hooks to take effect.');
  console.log('');
}

// Allow running directly: tsx src/setup-hooks.ts
if (process.argv[1]?.endsWith('setup-hooks.ts') || process.argv[1]?.endsWith('setup-hooks.js')) {
  setupHooks();
}
