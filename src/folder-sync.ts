// ============================================================================
// BeeHaven Office - Folder Sync
// Links local folders to Clearly projects and watches for asset changes
// ============================================================================

import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';
import { createHash } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, relative, join } from 'path';
import { homedir, hostname } from 'os';
import type { FileChange, LinkedFolder } from './types.js';
import type { Relay } from './relay.js';

const CONFIG_DIR = join(homedir(), '.beehaven');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** File extensions to sync (asset files only) */
const SYNC_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp',
  // Vector
  'svg',
  // Fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // Design tokens / config
  'json', 'yaml', 'yml', 'toml',
  // Styles
  'css', 'scss', 'less',
  // Documents
  'md', 'txt', 'pdf',
]);

/** Directories/files to ignore */
const IGNORE_PATTERNS = [
  '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
  '**/__pycache__/**', '**/.next/**', '**/.cache/**', '**/coverage/**',
  '**/.turbo/**', '**/.DS_Store',
];

// ── Config Helpers ──────────────────────────────────────────────────────────

function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(update: Record<string, unknown>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...update };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

/** Get all linked folders from config */
export function getLinkedFolders(): Record<string, LinkedFolder> {
  const config = loadConfig();
  return (config.linkedFolders as Record<string, LinkedFolder>) || {};
}

// ── Link / Unlink Flows ─────────────────────────────────────────────────────

/** Link the current folder to a Clearly project (brand) */
export async function linkProject(
  relay: Relay,
  folderPath?: string,
  brandId?: string,
): Promise<void> {
  const targetPath = folderPath || process.cwd();

  if (!relay.isConfigured()) {
    console.error('  Not linked to Clearly. Run: beehaven login');
    process.exit(1);
  }

  // If no brandId provided, list projects and prompt
  if (!brandId) {
    const projects = await relay.listProjects();
    if (!projects || projects.length === 0) {
      console.error('  No projects found in your Clearly account.');
      console.error('  Create a project at https://clearly.sh first.');
      process.exit(1);
    }

    console.log('\n  Available projects:\n');
    for (let i = 0; i < projects.length; i++) {
      console.log(`    ${i + 1}. ${projects[i].name} (${projects[i].id})`);
    }

    // Use readline for interactive selection
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('\n  Select project number: ', resolve);
    });
    rl.close();

    const idx = parseInt(answer, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= projects.length) {
      console.error('  Invalid selection.');
      process.exit(1);
    }
    brandId = projects[idx].id;
    console.log(`\n  Linking to: ${projects[idx].name}`);
  }

  // Store link in config
  const linked = getLinkedFolders();
  linked[targetPath] = { brandId, linkedAt: Date.now() };
  saveConfig({ linkedFolders: linked });

  // Notify Clearly
  await relay.updateBrandSync(brandId, {
    localPath: targetPath,
    syncDevice: hostname(),
    syncStatus: 'connected',
  });

  console.log(`\n  Linked: ${targetPath} → ${brandId}`);
  console.log('  BeeHaven will sync asset files when running.\n');
}

/** Unlink the current folder */
export async function unlinkProject(
  relay: Relay,
  folderPath?: string,
): Promise<void> {
  const targetPath = folderPath || process.cwd();
  const linked = getLinkedFolders();
  const entry = linked[targetPath];

  if (!entry) {
    console.error(`  No linked project for: ${targetPath}`);
    process.exit(1);
  }

  // Clear sync status on Clearly
  if (relay.isConfigured()) {
    await relay.updateBrandSync(entry.brandId, {
      syncStatus: 'disconnected',
    });
  }

  delete linked[targetPath];
  saveConfig({ linkedFolders: linked });

  console.log(`\n  Unlinked: ${targetPath}\n`);
}

// ── Folder Watcher ──────────────────────────────────────────────────────────

export class FolderWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private fileHashes = new Map<string, string>();
  private pendingChanges = new Map<string, FileChange>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  readonly brandId: string;

  constructor(
    private rootPath: string,
    brandId: string,
    private relay: Relay,
  ) {
    super();
    this.brandId = brandId;
  }

  start(): void {
    this.watcher = watch(this.rootPath, {
      persistent: true,
      ignoreInitial: false,
      ignored: IGNORE_PATTERNS,
      depth: 8,
      usePolling: false,
    });

    this.watcher
      .on('add', (path) => this.handleFile('add', path))
      .on('change', (path) => this.handleFile('change', path))
      .on('unlink', (path) => this.handleFile('delete', path));
  }

  stop(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.watcher?.close();
    this.watcher = null;
  }

  private handleFile(action: 'add' | 'change' | 'delete', filePath: string): void {
    const ext = extname(filePath).slice(1).toLowerCase();
    if (!SYNC_EXTENSIONS.has(ext)) return;

    const relativePath = relative(this.rootPath, filePath);
    this.pendingChanges.set(relativePath, { action, relativePath, ext });

    // Debounce 500ms — batch rapid changes
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 500);
  }

  private async flush(): Promise<void> {
    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    if (changes.length === 0) return;

    this.emit('syncing', changes.length);

    for (const change of changes) {
      try {
        if (change.action === 'delete') {
          await this.relay.syncFileDelete(this.brandId, change.relativePath);
        } else {
          const fullPath = join(this.rootPath, change.relativePath);
          if (!existsSync(fullPath)) continue;

          const content = readFileSync(fullPath);
          const hash = createHash('md5').update(content).digest('hex');

          // Skip if unchanged
          if (this.fileHashes.get(change.relativePath) === hash) continue;
          this.fileHashes.set(change.relativePath, hash);

          await this.relay.syncFileUpload(this.brandId, change.relativePath, content, hash);
        }
      } catch (err: any) {
        console.error(`[folder-sync] Error syncing ${change.relativePath}: ${err.message}`);
      }
    }

    this.emit('synced', changes.length);
  }
}
