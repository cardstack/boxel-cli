import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createRealmState, type RealmServerState } from '../helpers/mock-realm-server.js';
import { createMockFetch, type FetchCall } from '../helpers/mock-fetch.js';
import { TEST_REALM_URL } from '../helpers/mock-credentials.js';

const mockCredentials = vi.hoisted(() => ({
  matrixUrl: 'https://matrix.test.local/',
  username: 'testuser',
  password: 'testpassword',
}));

vi.mock('../../src/lib/realm-sync-base.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    validateMatrixEnvVars: vi.fn().mockResolvedValue(mockCredentials),
  };
});

vi.mock('../../src/lib/checkpoint-manager.js', () => ({
  CheckpointManager: vi.fn().mockImplementation(() => ({
    createCheckpoint: vi.fn().mockReturnValue({
      shortHash: 'abc1234',
      message: 'test checkpoint',
      isMajor: false,
    }),
  })),
}));

// Mock readline to avoid interactive prompts in conflict resolution
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn((_q: string, cb: (answer: string) => void) => cb('l')),
    close: vi.fn(),
  }),
}));

const { syncCommand } = await import('../../src/commands/sync.js');

describe('sync integration', () => {
  let tmpDir: string;
  let realmState: RealmServerState;
  let calls: FetchCall[];
  let originalFetch: typeof fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'boxel-sync-test-'));
    originalFetch = globalThis.fetch;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.mocked(console.log).mockRestore?.();
    vi.mocked(console.error).mockRestore?.();
    vi.mocked(console.warn).mockRestore?.();
    vi.mocked(process.exit).mockRestore?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupFetch(state: RealmServerState, onRequest?: (url: string, method: string) => void) {
    const result = createMockFetch({ realmState: state, onRequest });
    calls = result.calls;
    globalThis.fetch = result.mockFetch;
    return result;
  }

  function writeLocalFile(localDir: string, relPath: string, content: string) {
    const fullPath = path.join(localDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function writeManifest(localDir: string, manifest: {
    workspaceUrl: string;
    lastSyncTime: number;
    files: Record<string, { localHash: string; remoteMtime: number }>;
  }) {
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(
      path.join(localDir, '.boxel-sync.json'),
      JSON.stringify(manifest, null, 2),
    );
  }

  function computeHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  // --- First sync tests ---

  it('first sync: local files pushed, remote files pulled', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/remote.json': { content: '{"title":"Remote"}', mtime: baseMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/local.json', '{"title":"Local"}');

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Local file pushed to remote
    expect(realmState.files.has('BlogPost/local.json')).toBe(true);
    expect(realmState.files.get('BlogPost/local.json')?.content).toBe('{"title":"Local"}');

    // Remote file pulled to local
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'remote.json'))).toBe(true);
    expect(fs.readFileSync(path.join(localDir, 'BlogPost', 'remote.json'), 'utf-8'))
      .toBe('{"title":"Remote"}');

    // Manifest written
    expect(fs.existsSync(path.join(localDir, '.boxel-sync.json'))).toBe(true);
  });

  // --- Subsequent sync: local modified ---

  it('local modified file is pushed', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const originalContent = '{"title":"Original"}';
    const originalHash = computeHash(originalContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: originalContent, mtime: baseMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', '{"title":"Modified Locally"}');

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash: originalHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Local change pushed to remote
    expect(realmState.files.get('BlogPost/hello.json')?.content).toBe('{"title":"Modified Locally"}');
  });

  // --- Subsequent sync: remote modified ---

  it('remote modified file is pulled', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const newMtime = Math.floor(Date.now() / 1000);
    const localContent = '{"title":"Original"}';
    const localHash = computeHash(localContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: '{"title":"Modified on Server"}', mtime: newMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', localContent);

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Remote change pulled to local
    expect(fs.readFileSync(path.join(localDir, 'BlogPost', 'hello.json'), 'utf-8'))
      .toBe('{"title":"Modified on Server"}');
  });

  // --- Conflict resolution ---

  it('conflict resolved with --prefer-local pushes local', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const newMtime = Math.floor(Date.now() / 1000);
    const originalContent = '{"title":"Original"}';
    const originalHash = computeHash(originalContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: '{"title":"Server Version"}', mtime: newMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', '{"title":"Local Version"}');

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash: originalHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, { preferLocal: true });

    // Local version pushed to remote
    expect(realmState.files.get('BlogPost/hello.json')?.content).toBe('{"title":"Local Version"}');
  });

  it('conflict resolved with --prefer-remote pulls remote', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const newMtime = Math.floor(Date.now() / 1000);
    const originalContent = '{"title":"Original"}';
    const originalHash = computeHash(originalContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: '{"title":"Server Version"}', mtime: newMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', '{"title":"Local Version"}');

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash: originalHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, { preferRemote: true });

    // Remote version pulled to local
    expect(fs.readFileSync(path.join(localDir, 'BlogPost', 'hello.json'), 'utf-8'))
      .toBe('{"title":"Server Version"}');
  });

  it('conflict resolved with --prefer-newest picks newest', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    // Remote has newer mtime
    const newRemoteMtime = Math.floor(Date.now() / 1000) + 10;
    const originalContent = '{"title":"Original"}';
    const originalHash = computeHash(originalContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: '{"title":"Server Newer"}', mtime: newRemoteMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', '{"title":"Local Older"}');
    // Set local mtime to be older
    const oldTime = new Date('2024-01-01');
    fs.utimesSync(path.join(localDir, 'BlogPost', 'hello.json'), oldTime, oldTime);

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash: originalHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, { preferNewest: true });

    // Remote is newer, so it should be pulled
    expect(fs.readFileSync(path.join(localDir, 'BlogPost', 'hello.json'), 'utf-8'))
      .toBe('{"title":"Server Newer"}');
  });

  // --- Deletion handling ---

  it('local deleted + --prefer-local sends DELETE to remote', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const localContent = '{"title":"Will be deleted"}';
    const localHash = computeHash(localContent);

    realmState = createRealmState({
      'BlogPost/hello.json': { content: localContent, mtime: baseMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(localDir, { recursive: true });
    // File is NOT present locally (deleted)

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, { preferLocal: true });

    // Verify DELETE was sent
    const deleteCalls = calls.filter(c => c.method === 'DELETE');
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    expect(deleteCalls.some(c => c.url.includes('hello.json'))).toBe(true);
  });

  it('remote deleted file is deleted locally', async () => {
    const baseMtime = Math.floor(Date.now() / 1000) - 100;
    const localContent = '{"title":"Will be deleted"}';
    const localHash = computeHash(localContent);

    // Remote does NOT have the file (it was deleted on server)
    realmState = createRealmState({});
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/hello.json', localContent);

    writeManifest(localDir, {
      workspaceUrl: TEST_REALM_URL,
      lastSyncTime: Date.now() - 60000,
      files: {
        'BlogPost/hello.json': { localHash, remoteMtime: baseMtime },
      },
    });

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Local file should be deleted
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'hello.json'))).toBe(false);
  });

  // --- Dry run ---

  it('sync --dry-run does no actual I/O', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/remote.json': { content: '{"title":"Remote"}', mtime: baseMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/local.json', '{"title":"Local"}');

    await syncCommand(localDir, TEST_REALM_URL, { dryRun: true });

    // Local file NOT pushed to remote
    expect(realmState.files.has('BlogPost/local.json')).toBe(false);
    // Remote file NOT pulled to local
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'remote.json'))).toBe(false);
  });

  // --- Manifest verification ---

  it('manifest has correct hashes and mtimes after sync', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/remote.json': { content: '{"title":"Remote"}', mtime: baseMtime },
    });
    setupFetch(realmState);

    const localDir = path.join(tmpDir, 'workspace');
    writeLocalFile(localDir, 'BlogPost/local.json', '{"title":"Local"}');

    await syncCommand(localDir, TEST_REALM_URL, {});

    const manifest = JSON.parse(fs.readFileSync(path.join(localDir, '.boxel-sync.json'), 'utf-8'));
    expect(manifest.workspaceUrl).toBe(TEST_REALM_URL);
    expect(typeof manifest.lastSyncTime).toBe('number');
    expect(manifest.files['BlogPost/local.json']).toBeDefined();
    expect(manifest.files['BlogPost/local.json'].localHash).toBe(computeHash('{"title":"Local"}'));
    expect(manifest.files['BlogPost/remote.json']).toBeDefined();
    expect(manifest.files['BlogPost/remote.json'].localHash).toBe(computeHash('{"title":"Remote"}'));
  });

  // --- Concurrent server activity tests ---

  it('new file added on server mid-sync is pulled correctly', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/existing.json': { content: '{"title":"Existing"}', mtime: baseMtime },
    });

    let mtimesCallCount = 0;
    setupFetch(realmState, (url) => {
      // After the first _mtimes call, add a new file (simulating UI activity)
      if (url.includes('_mtimes')) {
        mtimesCallCount++;
        if (mtimesCallCount === 1) {
          realmState.files.set('BlogPost/from-ui.json', {
            path: 'BlogPost/from-ui.json',
            content: '{"title":"Created in UI"}',
            mtime: baseMtime + 10,
          });
        }
      }
    });

    const localDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(localDir, { recursive: true });

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Both files should be present locally
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'existing.json'))).toBe(true);
    // The new file added mid-sync should also be pulled
    // (it appears in the file listing since we add it before listing)
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'from-ui.json'))).toBe(true);
  });

  it('remote file modified mid-sync gets latest content', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/hello.json': { content: '{"title":"Version 1"}', mtime: baseMtime },
    });

    let sawMtimes = false;
    setupFetch(realmState, (url) => {
      // After mtimes, update the file content (simulating another user's edit)
      if (url.includes('_mtimes')) {
        sawMtimes = true;
      }
      // When the actual download happens, update content
      if (sawMtimes && url.includes('hello.json') && !url.endsWith('/')) {
        realmState.files.set('BlogPost/hello.json', {
          path: 'BlogPost/hello.json',
          content: '{"title":"Version 2 (edited in UI)"}',
          mtime: baseMtime + 5,
        });
      }
    });

    const localDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(localDir, { recursive: true });

    await syncCommand(localDir, TEST_REALM_URL, {});

    // Should have the latest content
    const content = fs.readFileSync(path.join(localDir, 'BlogPost', 'hello.json'), 'utf-8');
    expect(content).toBe('{"title":"Version 2 (edited in UI)"}');
  });

  it('remote file deleted mid-sync handles 404 gracefully', async () => {
    const baseMtime = Math.floor(Date.now() / 1000);
    realmState = createRealmState({
      'BlogPost/stable.json': { content: '{"title":"Stable"}', mtime: baseMtime },
      'BlogPost/ephemeral.json': { content: '{"title":"Will be deleted"}', mtime: baseMtime },
    });

    let sawMtimes = false;
    setupFetch(realmState, (url, method) => {
      if (url.includes('_mtimes')) {
        sawMtimes = true;
      }
      // Delete the ephemeral file before its download
      if (sawMtimes && method === 'GET' && url.includes('ephemeral.json') && !url.endsWith('/')) {
        realmState.files.delete('BlogPost/ephemeral.json');
      }
    });

    const localDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(localDir, { recursive: true });

    // Should handle gracefully — may exit with error code due to failed download
    try {
      await syncCommand(localDir, TEST_REALM_URL, {});
    } catch (e) {
      // process.exit(2) is acceptable for partial failures
      expect((e as Error).message).toMatch(/process\.exit/);
    }

    // Stable file still pulled
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'stable.json'))).toBe(true);
    // Ephemeral file not written locally (was deleted before download)
    expect(fs.existsSync(path.join(localDir, 'BlogPost', 'ephemeral.json'))).toBe(false);
  });
});
