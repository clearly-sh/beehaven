// ============================================================================
// BeeHaven Office - Project File Tree Scanner
// Scans project directories and returns file listings for city visualization
// ============================================================================

import { readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

export interface ProjectFileEntry {
  path: string;    // relative path from project root: "src/index.ts"
  name: string;    // filename: "index.ts"
  ext: string;     // extension without dot: "ts"
  dir: string;     // top-level directory: "src" or "." for root
  size: number;    // file size in bytes
}

export interface ProjectFileTree {
  project: string;
  root: string;
  files: ProjectFileEntry[];
  directories: string[];
  scannedAt: number;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', '.cache', 'coverage', '.turbo', '.vercel',
  '.svelte-kit', '.nuxt', 'target', 'vendor', '.gradle',
  '.idea', '.vscode', '.DS_Store', '.claude',
]);

const SKIP_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock',
  'pnpm-lock.yaml',
]);

const MAX_FILES = 500;
const MAX_DEPTH = 8;
const CACHE_TTL_MS = 30_000;

const cache = new Map<string, ProjectFileTree>();

export function scanProjectFiles(project: string, rootPath: string): ProjectFileTree | null {
  if (!existsSync(rootPath)) return null;

  const cached = cache.get(rootPath);
  if (cached && Date.now() - cached.scannedAt < CACHE_TTL_MS) {
    return cached;
  }

  const files: ProjectFileEntry[] = [];
  const dirs = new Set<string>();

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        walk(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dir, entry.name);
        const relPath = relative(rootPath, fullPath);
        const ext = extname(entry.name).slice(1).toLowerCase();
        const topDir = relPath.includes('/') ? relPath.split('/')[0] : '.';
        dirs.add(topDir);

        let size = 0;
        try { size = statSync(fullPath).size; } catch { /* skip */ }

        files.push({ path: relPath, name: entry.name, ext, dir: topDir, size });
      }
    }
  }

  walk(rootPath, 0);

  const result: ProjectFileTree = {
    project,
    root: rootPath,
    files,
    directories: Array.from(dirs).sort(),
    scannedAt: Date.now(),
  };

  cache.set(rootPath, result);
  return result;
}
