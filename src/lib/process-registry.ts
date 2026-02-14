import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type RegisteredProcessType = 'watch' | 'track';

interface RegisteredProcess {
  pid: number;
  type: RegisteredProcessType;
  workspace: string;
  startedAt: string;
}

interface ProcessRegistry {
  processes: RegisteredProcess[];
}

const REGISTRY_DIR = path.join(os.homedir(), '.boxel-cli');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'processes.json');

function ensureRegistryDir(): void {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadRegistry(): ProcessRegistry {
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { processes: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8')) as ProcessRegistry;
    return Array.isArray(parsed.processes) ? parsed : { processes: [] };
  } catch {
    return { processes: [] };
  }
}

function saveRegistry(registry: ProcessRegistry): void {
  ensureRegistryDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

export function registerProcess(type: RegisteredProcessType, workspace: string): void {
  const registry = pruneDeadProcesses();
  const pid = process.pid;

  const withoutCurrent = registry.processes.filter((entry) => entry.pid !== pid);
  withoutCurrent.push({
    pid,
    type,
    workspace,
    startedAt: new Date().toISOString(),
  });
  saveRegistry({ processes: withoutCurrent });
}

export function unregisterCurrentProcess(): void {
  const registry = loadRegistry();
  const next = registry.processes.filter((entry) => entry.pid !== process.pid);
  saveRegistry({ processes: next });
}

export function listRegisteredProcesses(): RegisteredProcess[] {
  return pruneDeadProcesses().processes;
}

function pruneDeadProcesses(): ProcessRegistry {
  const registry = loadRegistry();
  const alive = registry.processes.filter((entry) => isProcessAlive(entry.pid));
  const pruned = { processes: alive };

  if (alive.length !== registry.processes.length) {
    saveRegistry(pruned);
  }

  return pruned;
}
