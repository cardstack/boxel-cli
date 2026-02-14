import { execSync } from 'child_process';
import { listRegisteredProcesses } from '../lib/process-registry.js';

interface StoppedProcess {
  pid: string;
  type: 'watch' | 'track';
  workspace: string;
}

export async function stopCommand(): Promise<void> {
  console.log('🛑 Stopping all Boxel watchers and trackers...\n');

  const stopped: StoppedProcess[] = [];

  // Preferred path: stop processes we started and registered.
  const registered = listRegisteredProcesses();
  for (const proc of registered) {
    if (proc.pid === process.pid) {
      continue;
    }

    try {
      if (process.platform === 'win32') {
        try {
          process.kill(proc.pid);
        } catch {
          execSync(`taskkill /PID ${proc.pid} /F`, { stdio: 'ignore' });
        }
      } else {
        process.kill(proc.pid, 'SIGINT');
      }

      stopped.push({
        pid: String(proc.pid),
        type: proc.type,
        workspace: proc.workspace || '.',
      });
    } catch {
      // Process may already be gone.
    }
  }

  if (stopped.length > 0) {
    for (const proc of stopped) {
      const icon = proc.type === 'watch' ? '⇅ ' : '⇆ ';
      const typeStr = proc.type.padEnd(5);
      console.log(`  ${icon} Stopped: boxel ${typeStr} ${proc.workspace} (PID ${proc.pid})`);
    }
    console.log(`\n✓ Stopped ${stopped.length} process${stopped.length > 1 ? 'es' : ''}`);
    return;
  }

  // Backward-compatibility fallback for pre-registry Unix processes.
  if (process.platform === 'win32') {
    console.log('  No registered watch/track processes found.');
    return;
  }

  try {
    // Find boxel watch and track processes
    // Match both development mode (tsx src/index.ts) and installed mode (boxel or node...boxel)
    // Use more specific pattern with word boundaries to avoid false positives
    const result = execSync(
      `ps aux | grep -E '(tsx[[:space:]].*src/index\\.ts[[:space:]]+(watch|track)|[[:space:]]boxel[[:space:]]+(watch|track)|node[[:space:]].*boxel[[:space:]]+(watch|track))' | grep -v grep | grep -v '[[:space:]]stop'`,
      { encoding: 'utf-8' }
    ).trim();

    if (result) {
      const lines = result.split('\n').filter(Boolean);
      const seenPids = new Set<string>();

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[1];

        // Skip if we've already processed this PID (avoid duplicates)
        if (seenPids.has(pid)) continue;
        seenPids.add(pid);

        // Parse the command to extract type and workspace
        const isWatch = line.includes(' watch');
        const isTrack = line.includes(' track');
        if (!isWatch && !isTrack) continue;

        const type = isWatch ? 'watch' : 'track';

        // Extract workspace path - look for path after watch/track
        let workspace = '.';
        const cmdMatch = line.match(/(?:watch|track)\s+([^\s]+)/);
        if (cmdMatch && cmdMatch[1] && !cmdMatch[1].startsWith('-')) {
          workspace = cmdMatch[1];
        }

        try {
          process.kill(parseInt(pid), 'SIGINT');
          stopped.push({ pid, type, workspace });
        } catch {
          // Process may have already exited
        }
      }
    }
  } catch {
    // No processes found (grep returns non-zero)
  }

  if (stopped.length === 0) {
    console.log('  No running watchers or trackers found.');
  } else {
    for (const proc of stopped) {
      const icon = proc.type === 'watch' ? '⇅ ' : '⇆ ';
      const typeStr = proc.type.padEnd(5);  // "watch" or "track"
      console.log(`  ${icon} Stopped: boxel ${typeStr} ${proc.workspace} (PID ${proc.pid})`);
    }
    console.log(`\n✓ Stopped ${stopped.length} process${stopped.length > 1 ? 'es' : ''}`);
  }
}
