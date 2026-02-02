import * as fs from 'fs';
import * as path from 'path';
import { MatrixClient } from '../lib/matrix-client.js';
import { RealmAuthClient } from '../lib/realm-auth-client.js';
import { resolveWorkspace } from '../lib/workspace-resolver.js';
import { CheckpointManager, type CheckpointChange } from '../lib/checkpoint-manager.js';
import { createHash } from 'crypto';

interface WatchOptions {
  interval?: number;
  quiet?: boolean;
  debounce?: number;
}

interface SyncManifest {
  workspaceUrl: string;
  lastSync: string;
  files: Record<string, { hash: string; mtime: number }>;
}

export async function watchCommand(
  workspaceRef: string,
  options: WatchOptions
): Promise<void> {
  const intervalMs = (options.interval || 30) * 1000; // Default 30 seconds
  const debounceMs = (options.debounce ?? 5) * 1000; // Default 5 seconds debounce

  // Resolve workspace
  const resolved = await resolveWorkspace(workspaceRef);
  if (!resolved.localDir) {
    console.error('Watch requires a local directory. Use: boxel watch ./path');
    process.exit(1);
  }

  const localDir = resolved.localDir;
  const workspaceUrl = resolved.workspaceUrl;

  if (!workspaceUrl) {
    console.error('No workspace URL found. Run sync first to set up the workspace.');
    process.exit(1);
  }

  // Ensure trailing slash
  const normalizedUrl = workspaceUrl.endsWith('/') ? workspaceUrl : workspaceUrl + '/';

  console.log(`👁  Watching: ${normalizedUrl}`);
  console.log(`   Local: ${localDir}`);
  console.log(`   Interval: ${intervalMs / 1000}s, Debounce: ${debounceMs / 1000}s`);
  console.log(`   Press Ctrl+C to stop\n`);

  // Initialize
  const matrixUrl = process.env.MATRIX_URL;
  const username = process.env.MATRIX_USERNAME;
  const password = process.env.MATRIX_PASSWORD;

  if (!matrixUrl || !username || !password) {
    console.error('Missing required environment variables: MATRIX_URL, MATRIX_USERNAME, MATRIX_PASSWORD');
    process.exit(1);
  }

  const matrixClient = new MatrixClient({
    matrixURL: new URL(matrixUrl),
    username,
    password,
  });

  await matrixClient.login();

  const realmAuth = new RealmAuthClient(new URL(normalizedUrl), matrixClient);
  const jwt = await realmAuth.getJWT();

  const checkpointManager = new CheckpointManager(localDir);
  if (!checkpointManager.isInitialized()) {
    checkpointManager.init();
  }

  let lastKnownState: Record<string, number> = {};
  let pendingChanges: Map<string, { status: 'added' | 'modified' | 'deleted'; mtime: number }> = new Map();
  let debounceTimer: NodeJS.Timeout | null = null;
  let lastChangeTime: number = 0;

  // Load initial state from manifest
  const manifestPath = path.join(localDir, '.boxel-sync.json');
  if (fs.existsSync(manifestPath)) {
    const manifest: SyncManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const [file, info] of Object.entries(manifest.files)) {
      lastKnownState[file] = info.mtime;
    }
  }

  const applyPendingChanges = async (remoteMtimes: Record<string, number>) => {
    if (pendingChanges.size === 0) return;

    const changes: CheckpointChange[] = [];
    const newFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const [file, info] of pendingChanges.entries()) {
      changes.push({ file, status: info.status });
      if (info.status === 'added') newFiles.push(file);
      else if (info.status === 'modified') modifiedFiles.push(file);
      else deletedFiles.push(file);
    }

    console.log(`\n[${timestamp()}] 📦 Applying ${changes.length} changes (debounced)...`);

    if (newFiles.length > 0) {
      console.log(`  + ${newFiles.length} new: ${newFiles.slice(0, 3).join(', ')}${newFiles.length > 3 ? '...' : ''}`);
    }
    if (modifiedFiles.length > 0) {
      console.log(`  ~ ${modifiedFiles.length} modified: ${modifiedFiles.slice(0, 3).join(', ')}${modifiedFiles.length > 3 ? '...' : ''}`);
    }
    if (deletedFiles.length > 0) {
      console.log(`  - ${deletedFiles.length} deleted: ${deletedFiles.slice(0, 3).join(', ')}${deletedFiles.length > 3 ? '...' : ''}`);
    }

    // Pull the changes
    console.log(`  Pulling changes...`);

    for (const file of [...newFiles, ...modifiedFiles]) {
      const fileUrl = `${normalizedUrl}${file}`;
      const fileResponse = await fetch(fileUrl, {
        headers: {
          'Authorization': jwt,
          'Accept': file.endsWith('.json') ? 'application/vnd.card+json' : '*/*',
        },
      });

      if (fileResponse.ok) {
        const content = await fileResponse.text();
        const localPath = path.join(localDir, file);
        const localDirPath = path.dirname(localPath);

        if (!fs.existsSync(localDirPath)) {
          fs.mkdirSync(localDirPath, { recursive: true });
        }

        fs.writeFileSync(localPath, content);
      }
    }

    // Handle deletions
    for (const file of deletedFiles) {
      const localPath = path.join(localDir, file);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }

    // Create checkpoint
    const checkpoint = checkpointManager.createCheckpoint('remote', changes);
    if (checkpoint) {
      console.log(`  📍 Checkpoint: ${checkpoint.shortHash} ${checkpoint.isMajor ? '[MAJOR]' : '[minor]'} ${checkpoint.message}`);
    }

    // Update last known state
    lastKnownState = { ...remoteMtimes };

    // Update manifest
    const manifest: SyncManifest = {
      workspaceUrl: normalizedUrl,
      lastSync: new Date().toISOString(),
      files: {},
    };

    for (const [file, mtime] of Object.entries(remoteMtimes)) {
      const localPath = path.join(localDir, file);
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath);
        const hash = createHash('sha256').update(content).digest('hex');
        manifest.files[file] = { hash, mtime };
      }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Clear pending changes
    pendingChanges.clear();
  };

  const checkForChanges = async () => {
    try {
      // Fetch remote mtimes
      const mtimesUrl = `${normalizedUrl}_mtimes`;
      const response = await fetch(mtimesUrl, {
        headers: {
          'Authorization': jwt,
          'Accept': 'application/vnd.api+json',
        },
      });

      if (!response.ok) {
        if (!options.quiet) {
          console.error(`[${timestamp()}] Failed to fetch remote state: ${response.status}`);
        }
        return;
      }

      const data = await response.json();
      const mtimesData = data?.data?.attributes?.mtimes || {};

      // Convert to relative paths
      const remoteMtimes: Record<string, number> = {};
      for (const [fullUrl, mtime] of Object.entries(mtimesData)) {
        if (fullUrl.startsWith(normalizedUrl)) {
          const relativePath = fullUrl.substring(normalizedUrl.length);
          if (relativePath && !relativePath.startsWith('_')) {
            remoteMtimes[relativePath] = mtime as number;
          }
        }
      }

      // Detect new changes since last check
      let hasNewChanges = false;

      // Check for new/modified files
      for (const [file, mtime] of Object.entries(remoteMtimes)) {
        if (!(file in lastKnownState)) {
          if (!pendingChanges.has(file) || pendingChanges.get(file)!.mtime !== mtime) {
            pendingChanges.set(file, { status: 'added', mtime });
            hasNewChanges = true;
          }
        } else if (mtime > lastKnownState[file]) {
          if (!pendingChanges.has(file) || pendingChanges.get(file)!.mtime !== mtime) {
            pendingChanges.set(file, { status: 'modified', mtime });
            hasNewChanges = true;
          }
        }
      }

      // Check for deleted files
      for (const file of Object.keys(lastKnownState)) {
        if (!(file in remoteMtimes) && !pendingChanges.has(file)) {
          pendingChanges.set(file, { status: 'deleted', mtime: 0 });
          hasNewChanges = true;
        }
      }

      if (hasNewChanges) {
        lastChangeTime = Date.now();
        console.log(`\n[${timestamp()}] 🔔 Changes detected (${pendingChanges.size} pending, waiting for more...)`);

        // Clear existing debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Set new debounce timer
        debounceTimer = setTimeout(async () => {
          await applyPendingChanges(remoteMtimes);
          debounceTimer = null;
        }, debounceMs);

      } else if (pendingChanges.size > 0) {
        // Still have pending changes, check if debounce period elapsed
        const elapsed = Date.now() - lastChangeTime;
        if (!options.quiet) {
          process.stdout.write(`\r[${timestamp()}] ⏳ ${pendingChanges.size} pending (${Math.ceil((debounceMs - elapsed) / 1000)}s until checkpoint)`);
        }
      } else if (!options.quiet) {
        process.stdout.write(`\r[${timestamp()}] ✓ No changes`);
      }

    } catch (error) {
      if (!options.quiet) {
        console.error(`\n[${timestamp()}] Error checking server:`, error);
      }
    }
  };

  // Initial check
  await checkForChanges();

  // Set up polling
  const intervalId = setInterval(checkForChanges, intervalMs);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n\n👁  Watch stopped');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}
