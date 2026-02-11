// ============================================================================
// BeeHaven Office - Claude Code Event Watcher
// Watches the JSONL events file written by the hook script
// ============================================================================

import { watch } from 'chokidar';
import { createReadStream, existsSync, writeFileSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import type { ClaudeEvent } from './types.js';

const EVENTS_FILE = '/tmp/beehaven-events.jsonl';

export class ClaudeWatcher extends EventEmitter {
  private lastSize = 0;
  private processing = false;

  start() {
    // Create events file if it doesn't exist
    if (!existsSync(EVENTS_FILE)) {
      writeFileSync(EVENTS_FILE, '');
    }

    // Get initial file size
    this.lastSize = statSync(EVENTS_FILE).size;

    // Watch for changes
    const watcher = watch(EVENTS_FILE, {
      persistent: true,
      usePolling: true,
      interval: 100,
    });

    watcher.on('change', () => {
      this.readNewLines();
    });

    console.log(`[watcher] Watching ${EVENTS_FILE} for Claude Code events...`);
  }

  private async readNewLines() {
    if (this.processing) return;
    this.processing = true;

    try {
      const currentSize = statSync(EVENTS_FILE).size;
      if (currentSize <= this.lastSize) {
        // File was truncated or unchanged
        if (currentSize < this.lastSize) this.lastSize = 0;
        this.processing = false;
        return;
      }

      const stream = createReadStream(EVENTS_FILE, {
        start: this.lastSize,
        encoding: 'utf8',
      });

      const rl = createInterface({ input: stream });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const event: ClaudeEvent = JSON.parse(line);
          this.emit('event', event);
        } catch {
          // Skip malformed lines
        }
      }

      this.lastSize = currentSize;
    } catch {
      // File may have been deleted/recreated
      this.lastSize = 0;
    }

    this.processing = false;
  }

  /** Clear the events file */
  clear() {
    writeFileSync(EVENTS_FILE, '');
    this.lastSize = 0;
  }
}
