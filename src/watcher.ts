// ============================================================================
// BeeHaven Office - Claude Code Event Watcher
// Watches the JSONL events file written by the hook script
// ============================================================================

import { watch } from 'chokidar';
import { createReadStream, existsSync, writeFileSync, statSync, renameSync } from 'fs';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import type { ClaudeEvent } from './types.js';

const EVENTS_FILE = '/tmp/beehaven-events.jsonl';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export class ClaudeWatcher extends EventEmitter {
  private lastSize = 0;
  private processing = false;
  private fsWatcher: ReturnType<typeof watch> | null = null;

  start() {
    // Create events file if it doesn't exist
    if (!existsSync(EVENTS_FILE)) {
      writeFileSync(EVENTS_FILE, '');
    }

    // Get initial file size
    this.lastSize = statSync(EVENTS_FILE).size;

    // Watch for changes
    this.fsWatcher = watch(EVENTS_FILE, {
      persistent: true,
      usePolling: true,
      interval: 100,
    });

    this.fsWatcher.on('change', () => {
      this.readNewLines();
    });

    // Rotate oversized file on startup
    this.rotateIfNeeded();

    console.log(`[watcher] Watching ${EVENTS_FILE} for Claude Code events...`);
  }

  /** Stop watching for file changes */
  stop() {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }

  /** Rotate the events file if it exceeds MAX_FILE_SIZE */
  private rotateIfNeeded() {
    try {
      const size = statSync(EVENTS_FILE).size;
      if (size > MAX_FILE_SIZE) {
        const rotated = `${EVENTS_FILE}.${Date.now()}.old`;
        renameSync(EVENTS_FILE, rotated);
        writeFileSync(EVENTS_FILE, '');
        this.lastSize = 0;
        console.log(`[watcher] Rotated events file (${(size / 1024 / 1024).toFixed(1)} MB) → ${rotated}`);
      }
    } catch {
      // File may not exist yet
    }
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
        } catch (err) {
          console.warn(`[watcher] Skipping malformed JSON line: ${line.slice(0, 100)}`, (err as Error).message);
        }
      }

      this.lastSize = currentSize;

      // Rotate if file has grown too large during this session
      this.rotateIfNeeded();
    } catch (err) {
      console.warn(`[watcher] File read error (resetting offset):`, (err as Error).message);
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
