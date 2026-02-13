#!/usr/bin/env node
// ============================================================================
// BeeHaven Office - CLI Entry Point
// Usage: beehaven [command] [options]
// ============================================================================

import { parseArgs } from 'node:util';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printHelp() {
  console.log(`
  \uD83D\uDC1D BeeHaven Office v${getVersion()}
  Visualize Claude Code activity as an animated bee office

  Usage:
    beehaven [command] [options]

  Commands:
    start          Start the office server (default)
    setup          Re-install Claude Code hooks (auto-installed on startup)
    uninstall      Remove BeeHaven hooks from ~/.claude/settings.json
    login          Link your Clearly account for cloud features
    logout         Unlink your Clearly account

  Options:
    --port <n>     Server port (default: 3333, env: BEEHAVEN_PORT)
    --no-open      Don't auto-open browser
    --verbose      Enable verbose logging
    --help, -h     Show this help
    --version, -v  Show version

  Examples:
    beehaven                    # Start the office
    beehaven --port 4000        # Start on custom port
    beehaven setup              # Configure hooks in current project
    beehaven login              # Link Clearly account
`);
}

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      open: { type: 'boolean', default: true },
      'no-open': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.version) {
    console.log(getVersion());
    return;
  }

  if (values.help) {
    printHelp();
    return;
  }

  const command = positionals[0] || 'start';

  switch (command) {
    case 'start': {
      const { main } = await import('./index.js');
      await main({
        port: values.port ? parseInt(values.port, 10) : undefined,
        openBrowser: !values['no-open'],
        verbose: values.verbose,
      });
      break;
    }

    case 'setup': {
      const { setupHooks } = await import('./setup-hooks.js');
      setupHooks();
      break;
    }

    case 'uninstall': {
      const { removeHooks } = await import('./setup-hooks.js');
      removeHooks();
      break;
    }

    case 'login': {
      const { login } = await import('./setup-relay.js');
      await login();
      break;
    }

    case 'logout': {
      const { logout } = await import('./setup-relay.js');
      logout();
      break;
    }

    default:
      console.error(`  Unknown command: ${command}`);
      console.error('  Run "beehaven --help" for usage.');
      process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
