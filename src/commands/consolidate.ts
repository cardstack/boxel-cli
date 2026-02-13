import * as fs from 'fs';
import * as path from 'path';
import { findLegacyWorkspaceDirs } from '../lib/workspace-paths.js';

interface ConsolidateOptions {
  dryRun?: boolean;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function consolidateWorkspacesCommand(
  rootDirInput: string | undefined,
  options: ConsolidateOptions,
): Promise<void> {
  const rootDir = path.resolve(rootDirInput || '.');
  const legacyEntries = findLegacyWorkspaceDirs(rootDir);

  if (legacyEntries.length === 0) {
    console.log(`No legacy workspace paths found under ${rootDir}`);
    return;
  }

  console.log(`Found ${legacyEntries.length} legacy workspace path(s):\n`);

  let moved = 0;
  let skipped = 0;

  for (const entry of legacyEntries) {
    const from = path.relative(rootDir, entry.currentDir) || '.';
    const to = path.relative(rootDir, entry.expectedDir) || '.';
    console.log(`- ${from} -> ${to}`);

    if (options.dryRun) {
      continue;
    }

    if (fs.existsSync(entry.expectedDir)) {
      console.warn('  Skipping: target path already exists');
      skipped += 1;
      continue;
    }

    ensureDir(path.dirname(entry.expectedDir));
    fs.renameSync(entry.currentDir, entry.expectedDir);
    moved += 1;
  }

  if (options.dryRun) {
    console.log('\n[DRY RUN] No directories moved.');
    return;
  }

  console.log(`\nMoved ${moved} workspace director${moved === 1 ? 'y' : 'ies'}.`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} due to existing target paths.`);
  }
}
