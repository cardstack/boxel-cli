import * as fs from 'fs';
import * as path from 'path';

interface SyncManifest {
  workspaceUrl: string;
}

export interface LegacyWorkspaceEntry {
  manifestPath: string;
  currentDir: string;
  expectedDir: string;
  workspaceUrl: string;
}

let didWarnInProcess = false;

function isSkippableDir(dirName: string): boolean {
  return dirName === '.git'
    || dirName === 'node_modules'
    || dirName === 'dist'
    || dirName === '.boxel-history'
    || dirName === '.claude';
}

function canonicalDomainFromHost(hostname: string): string {
  if (hostname.endsWith('stack.cards')) {
    return 'stack.cards';
  }
  if (hostname.endsWith('boxel.ai')) {
    return 'boxel.ai';
  }
  return hostname;
}

export function relativeStructuredPathForWorkspaceUrl(workspaceUrl: string): string {
  const url = new URL(workspaceUrl);
  const domain = canonicalDomainFromHost(url.hostname);
  const parts = url.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
  const owner = parts[0] ?? 'unknown-owner';
  const realm = parts[1] ?? parts[0] ?? 'workspace';
  return path.join(domain, owner, realm);
}

export function absoluteStructuredPathForWorkspaceUrl(workspaceUrl: string, rootDir: string): string {
  return path.resolve(rootDir, relativeStructuredPathForWorkspaceUrl(workspaceUrl));
}

function tryReadManifest(manifestPath: string): SyncManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Partial<SyncManifest>;
    if (typeof parsed.workspaceUrl !== 'string' || !parsed.workspaceUrl) {
      return null;
    }
    return { workspaceUrl: parsed.workspaceUrl };
  } catch {
    return null;
  }
}

function findManifestPaths(rootDir: string, maxDepth = 6): string[] {
  const manifests: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    const manifestPath = path.join(dir, '.boxel-sync.json');
    if (fs.existsSync(manifestPath)) {
      manifests.push(manifestPath);
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (isSkippableDir(entry.name)) {
        continue;
      }
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  walk(path.resolve(rootDir), 0);
  return manifests;
}

export function findLegacyWorkspaceDirs(rootDir: string): LegacyWorkspaceEntry[] {
  const absoluteRoot = path.resolve(rootDir);
  const manifestPaths = findManifestPaths(absoluteRoot);

  const legacyEntries: LegacyWorkspaceEntry[] = [];
  for (const manifestPath of manifestPaths) {
    const manifest = tryReadManifest(manifestPath);
    if (!manifest) {
      continue;
    }

    const currentDir = path.dirname(manifestPath);
    const expectedDir = absoluteStructuredPathForWorkspaceUrl(manifest.workspaceUrl, absoluteRoot);

    if (path.resolve(currentDir) !== path.resolve(expectedDir)) {
      legacyEntries.push({
        manifestPath,
        currentDir,
        expectedDir,
        workspaceUrl: manifest.workspaceUrl,
      });
    }
  }

  return legacyEntries;
}

export function warnIfLegacyWorkspacePaths(rootDir: string): void {
  if (didWarnInProcess || process.env.BOXEL_DISABLE_PATH_WARNING === '1') {
    return;
  }

  const legacyEntries = findLegacyWorkspaceDirs(rootDir);
  if (legacyEntries.length === 0) {
    return;
  }

  didWarnInProcess = true;

  console.warn('\n⚠️  Detected workspace directories using legacy local paths:');
  for (const entry of legacyEntries.slice(0, 5)) {
    const from = path.relative(path.resolve(rootDir), entry.currentDir) || '.';
    const to = path.relative(path.resolve(rootDir), entry.expectedDir) || '.';
    console.warn(`   - ${from} -> ${to}`);
  }
  if (legacyEntries.length > 5) {
    console.warn(`   ...and ${legacyEntries.length - 5} more`);
  }
  console.warn('\nRun to preview:');
  console.warn('   boxel consolidate-workspaces . --dry-run');
  console.warn('Then apply:');
  console.warn('   boxel consolidate-workspaces .\n');
}
