import * as fs from 'fs';
import * as os from 'os';
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

const DEFAULT_WORKSPACES_DIR = 'boxel-workspaces';

export function defaultWorkspacesRoot(): string {
  return path.join(os.homedir(), DEFAULT_WORKSPACES_DIR);
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
  // Use the full realm server hostname — no normalization
  // This avoids ambiguity between staging and production realms
  // e.g. realms-staging.stack.cards stays as realms-staging.stack.cards
  return hostname;
}

export function relativeStructuredPathForWorkspaceUrl(workspaceUrl: string): string {
  const url = new URL(workspaceUrl);
  const domain = canonicalDomainFromHost(url.hostname);
  const parts = url.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);

  // Published realms don't always have an owner in the URL — adapt the layout
  // so we don't invent fake owner segments or duplicate the realm name.
  if (parts.length === 0) {
    // e.g. https://gabbro.staging.boxel.build/ → <host>/
    return domain;
  }
  if (parts.length === 1) {
    // e.g. https://realms-staging.stack.cards/boxel-homepage/ → <host>/<realm>/
    return path.join(domain, parts[0]);
  }
  // Standard owned realm: <host>/<owner>/<realm>/
  return path.join(domain, parts[0], parts[1]);
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

function addManifestIfExists(dir: string, manifests: string[]): void {
  const manifestPath = path.join(dir, '.boxel-sync.json');
  if (fs.existsSync(manifestPath)) {
    manifests.push(manifestPath);
  }
}

function listSubdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isSkippableDir(entry.name))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function findManifestPaths(rootDir: string): string[] {
  const manifests: string[] = [];
  const absoluteRoot = path.resolve(rootDir);

  // One-level: <root>/<x>/.boxel-sync.json
  // Covers legacy <root>/<realm>/ AND the new 0-segment canonical case where
  // a published realm with no path lives at <root>/<host>/.
  for (const childDir of listSubdirs(absoluteRoot)) {
    addManifestIfExists(childDir, manifests);
  }

  // Two-level: <root>/<domain>/<realm>/.boxel-sync.json
  // The canonical shape for 1-segment published realms (no owner in URL).
  for (const domainDir of listSubdirs(absoluteRoot)) {
    for (const realmDir of listSubdirs(domainDir)) {
      addManifestIfExists(realmDir, manifests);
    }
  }

  // Three-level canonical: <root>/<domain>/<owner>/<realm>/.boxel-sync.json
  for (const domainDir of listSubdirs(absoluteRoot)) {
    for (const ownerDir of listSubdirs(domainDir)) {
      for (const realmDir of listSubdirs(ownerDir)) {
        addManifestIfExists(realmDir, manifests);
      }
    }
  }

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
  console.warn('   boxel doctor consolidate-workspaces --dry-run');
  console.warn('Then apply:');
  console.warn('   boxel doctor consolidate-workspaces\n');
}
