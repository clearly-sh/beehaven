// ============================================================================
// BeeHaven Office - Hook Configuration Setup
// Writes Claude Code hooks to GLOBAL ~/.claude/settings.json so events are
// captured from ALL projects, enabling multi-project office views.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'Notification',
  'PreCompact',
  'TeammateIdle',
  'TaskCompleted',
];

function getHookScript(): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return join(packageRoot, 'hooks', 'event-logger.sh');
}

function getGlobalSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/** Check if BeeHaven hooks are already configured in global settings */
export function hooksConfigured(): boolean {
  const globalPath = getGlobalSettingsPath();
  const hookScript = getHookScript();
  if (!existsSync(globalPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(globalPath, 'utf8'));
    const hooks = settings.hooks;
    if (!hooks) return false;
    // Check that at least the key events have our hook
    for (const event of ['PreToolUse', 'Stop', 'UserPromptSubmit']) {
      const entries = hooks[event];
      if (!Array.isArray(entries)) return false;
      const hasBeeHaven = entries.some((entry: any) =>
        entry?.hooks?.some((h: any) => h.command === hookScript)
      );
      if (!hasBeeHaven) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Install BeeHaven hooks into global ~/.claude/settings.json */
export function setupHooks(opts: { quiet?: boolean } = {}) {
  const hookScript = getHookScript();
  const globalDir = join(homedir(), '.claude');
  const globalPath = getGlobalSettingsPath();

  if (!opts.quiet) {
    console.log('');
    console.log('  \uD83D\uDC1D BeeHaven Office - Hook Setup');
    console.log('  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
    console.log('');
  }

  // Verify hook script exists
  if (!existsSync(hookScript)) {
    console.error(`  Error: Hook script not found at ${hookScript}`);
    if (!opts.quiet) process.exit(1);
    return;
  }

  // Ensure ~/.claude directory exists
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  // Read existing global settings (preserve permissions, etc.)
  let settings: Record<string, unknown> = {};
  if (existsSync(globalPath)) {
    try {
      settings = JSON.parse(readFileSync(globalPath, 'utf8'));
    } catch { /* start fresh */ }
  }

  // Define hook entry
  const hookEntry = {
    hooks: [{ type: 'command', command: hookScript, timeout: 5 }],
  };

  // Merge hooks — preserve any existing non-BeeHaven hooks per event
  const existingHooks = (settings.hooks || {}) as Record<string, unknown[]>;
  const mergedHooks: Record<string, unknown[]> = { ...existingHooks };

  for (const event of HOOK_EVENTS) {
    const existing = mergedHooks[event] as unknown[] | undefined;
    if (existing && Array.isArray(existing)) {
      // Remove any previous BeeHaven hooks (matching our script path), keep others
      const filtered = existing.filter((entry: any) => {
        const hooks = entry?.hooks || [];
        return !hooks.some((h: any) => h.command === hookScript);
      });
      filtered.push(hookEntry);
      mergedHooks[event] = filtered;
    } else {
      mergedHooks[event] = [hookEntry];
    }
  }

  settings.hooks = mergedHooks;
  writeFileSync(globalPath, JSON.stringify(settings, null, 2));

  if (!opts.quiet) {
    console.log(`  Scope: GLOBAL (all projects)`);
    console.log(`  Hook script: ${hookScript}`);
    console.log(`  Settings file: ${globalPath}`);
    console.log(`  Events configured: ${HOOK_EVENTS.length}`);
    console.log('');
    console.log('  Hooks configured globally! All Claude Code sessions will');
    console.log('  emit events to BeeHaven, enabling multi-project views.');
    console.log('');
    console.log('  Restart any running Claude Code sessions for hooks to take effect.');
    console.log('');
  } else {
    console.log(`  [hooks] Installed global hooks → ~/.claude/settings.json (${HOOK_EVENTS.length} events)`);
  }
}

/** Remove all BeeHaven hooks from global ~/.claude/settings.json */
export function removeHooks(opts: { quiet?: boolean } = {}) {
  const hookScript = getHookScript();
  const globalPath = getGlobalSettingsPath();

  if (!opts.quiet) {
    console.log('');
    console.log('  \uD83D\uDC1D BeeHaven Office - Remove Hooks');
    console.log('  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
    console.log('');
  }

  if (!existsSync(globalPath)) {
    if (!opts.quiet) console.log('  No settings file found — nothing to remove.');
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(globalPath, 'utf8'));
  } catch {
    if (!opts.quiet) console.error('  Error: Could not parse ~/.claude/settings.json');
    return;
  }

  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) {
    if (!opts.quiet) console.log('  No hooks configured — nothing to remove.');
    return;
  }

  // Match any hook command containing 'beehaven' or our exact script path
  const isBeeHavenHook = (entry: any) => {
    const entryHooks = entry?.hooks || [];
    return entryHooks.some((h: any) =>
      h.command === hookScript || (typeof h.command === 'string' && h.command.includes('beehaven'))
    );
  };

  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((entry: any) => !isBeeHavenHook(entry));
    removed += entries.length - filtered.length;
    if (filtered.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = filtered;
    }
  }

  // Clean up empty hooks object
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(globalPath, JSON.stringify(settings, null, 2));

  if (!opts.quiet) {
    if (removed > 0) {
      console.log(`  Removed ${removed} BeeHaven hook entries from ~/.claude/settings.json`);
      console.log('  Other hooks (if any) were preserved.');
      console.log('');
      console.log('  Restart any running Claude Code sessions for changes to take effect.');
    } else {
      console.log('  No BeeHaven hooks found — nothing to remove.');
    }
    console.log('');
  } else {
    if (removed > 0) {
      console.log(`  [hooks] Removed ${removed} BeeHaven hooks from ~/.claude/settings.json`);
    }
  }
}

/** Auto-setup: install hooks if not already present. Called on app startup. */
export function ensureHooks() {
  if (hooksConfigured()) return;
  console.log('  [hooks] Global hooks not found — installing automatically...');
  setupHooks({ quiet: true });
  console.log('  [hooks] To remove: beehaven uninstall');
}

// Allow running directly: tsx src/setup-hooks.ts
if (process.argv[1]?.endsWith('setup-hooks.ts') || process.argv[1]?.endsWith('setup-hooks.js')) {
  setupHooks();
}
