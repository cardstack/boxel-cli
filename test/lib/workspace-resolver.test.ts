import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveWorkspace } from '../../src/lib/workspace-resolver.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-resolver-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveWorkspace', () => {
  describe('local path resolution', () => {
    it('resolves . when .boxel-sync.json exists', async () => {
      const manifest = {
        workspaceUrl: 'https://app.boxel.ai/user/realm/',
        lastSyncTime: Date.now(),
        files: {},
      };
      fs.writeFileSync(
        path.join(tmpDir, '.boxel-sync.json'),
        JSON.stringify(manifest),
      );

      const result = await resolveWorkspace(tmpDir);
      expect(result.localDir).toBe(tmpDir);
      expect(result.workspaceUrl).toBe('https://app.boxel.ai/user/realm/');
      expect(result.manifest).toBeDefined();
    });

    it('throws when .boxel-sync.json is missing', async () => {
      await expect(resolveWorkspace(tmpDir)).rejects.toThrow('.boxel-sync.json');
    });

    it('resolves absolute path', async () => {
      const manifest = {
        workspaceUrl: 'https://app.boxel.ai/user/realm/',
        lastSyncTime: Date.now(),
        files: {},
      };
      fs.writeFileSync(
        path.join(tmpDir, '.boxel-sync.json'),
        JSON.stringify(manifest),
      );

      const result = await resolveWorkspace(tmpDir);
      expect(result.localDir).toBe(tmpDir);
    });
  });

  describe('@user/workspace resolution', () => {
    it('throws without matrix client', async () => {
      await expect(resolveWorkspace('@user/workspace')).rejects.toThrow('Matrix client required');
    });
  });

  describe('URL resolution', () => {
    it('resolves https URL', async () => {
      const result = await resolveWorkspace('https://app.boxel.ai/user/my-realm/');
      expect(result.workspaceUrl).toBe('https://app.boxel.ai/user/my-realm/');
      // localDir derived from URL path
      expect(result.localDir).toContain('my-realm');
    });

    it('resolves http URL', async () => {
      const result = await resolveWorkspace('http://localhost:4200/user/test/');
      expect(result.workspaceUrl).toBe('http://localhost:4200/user/test/');
      expect(result.localDir).toContain('test');
    });
  });

  describe('invalid references', () => {
    it('throws for unrecognized format', async () => {
      await expect(resolveWorkspace('invalid-ref')).rejects.toThrow('Invalid workspace reference');
    });
  });
});
