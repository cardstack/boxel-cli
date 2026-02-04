import { execSync } from 'child_process';

interface StoppedProcess {
  pid: string;
  type: 'watch' | 'track';
  workspace: string;
}

export async function stopCommand(): Promise<void> {
  console.log('🛑 Stopping all Boxel watchers and trackers...\n');

  const stopped: StoppedProcess[] = [];

  try {
    // Find boxel watch and track processes
    const result = execSync(
      `ps aux | grep -E 'tsx.*src/index.ts (watch|track)' | grep -v grep`,
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
