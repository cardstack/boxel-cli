import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getEditLockPath,
  loadEditLock,
  saveEditLock,
  clearEditLock,
  addToEditLock,
  removeFromEditLock,
  isFileBeingEdited,
  getEditingFiles,
  type EditLock,
} from '../../src/lib/edit-lock.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-lock-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getEditLockPath', () => {
  it('returns path to .boxel-editing.json in the given dir', () => {
    const result = getEditLockPath('/some/dir');
    expect(result).toBe('/some/dir/.boxel-editing.json');
  });
});

describe('loadEditLock', () => {
  it('returns null when no lock file exists', () => {
    expect(loadEditLock(tmpDir)).toBeNull();
  });

  it('loads existing lock file', () => {
    const lock: EditLock = { files: ['test.gts'], since: 1000, agent: 'claude' };
    fs.writeFileSync(path.join(tmpDir, '.boxel-editing.json'), JSON.stringify(lock));
    const loaded = loadEditLock(tmpDir);
    expect(loaded).toEqual(lock);
  });

  it('returns null for corrupted lock file', () => {
    fs.writeFileSync(path.join(tmpDir, '.boxel-editing.json'), 'invalid json{{{');
    expect(loadEditLock(tmpDir)).toBeNull();
  });
});

describe('saveEditLock', () => {
  it('writes lock to .boxel-editing.json', () => {
    const lock: EditLock = { files: ['a.gts', 'b.json'], since: 12345 };
    saveEditLock(tmpDir, lock);

    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, '.boxel-editing.json'), 'utf-8'));
    expect(content.files).toEqual(['a.gts', 'b.json']);
    expect(content.since).toBe(12345);
  });
});

describe('clearEditLock', () => {
  it('removes the lock file', () => {
    const lockPath = path.join(tmpDir, '.boxel-editing.json');
    fs.writeFileSync(lockPath, '{}');
    expect(fs.existsSync(lockPath)).toBe(true);

    clearEditLock(tmpDir);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('does nothing when no lock file exists', () => {
    // Should not throw
    clearEditLock(tmpDir);
  });
});

describe('addToEditLock', () => {
  it('creates new lock when none exists', () => {
    const lock = addToEditLock(tmpDir, ['test.gts'], 'claude');
    expect(lock.files).toEqual(['test.gts']);
    expect(lock.agent).toBe('claude');
    expect(lock.since).toBeGreaterThan(0);
  });

  it('appends to existing lock', () => {
    addToEditLock(tmpDir, ['a.gts']);
    const lock = addToEditLock(tmpDir, ['b.gts']);
    expect(lock.files).toEqual(['a.gts', 'b.gts']);
  });

  it('does not duplicate files', () => {
    addToEditLock(tmpDir, ['a.gts']);
    const lock = addToEditLock(tmpDir, ['a.gts', 'b.gts']);
    expect(lock.files).toEqual(['a.gts', 'b.gts']);
  });

  it('adds multiple files at once', () => {
    const lock = addToEditLock(tmpDir, ['a.gts', 'b.gts', 'c.json']);
    expect(lock.files).toHaveLength(3);
  });

  it('preserves existing lock timestamp', () => {
    const first = addToEditLock(tmpDir, ['a.gts']);
    const firstSince = first.since;
    const second = addToEditLock(tmpDir, ['b.gts']);
    // since should not change on subsequent adds
    expect(second.since).toBe(firstSince);
  });
});

describe('removeFromEditLock', () => {
  it('removes specific files from lock', () => {
    addToEditLock(tmpDir, ['a.gts', 'b.gts', 'c.gts']);
    const lock = removeFromEditLock(tmpDir, ['b.gts']);
    expect(lock?.files).toEqual(['a.gts', 'c.gts']);
  });

  it('clears lock file when all files removed', () => {
    addToEditLock(tmpDir, ['a.gts']);
    const lock = removeFromEditLock(tmpDir, ['a.gts']);
    expect(lock).toBeNull();
    expect(fs.existsSync(path.join(tmpDir, '.boxel-editing.json'))).toBe(false);
  });

  it('clears all files when no specific files given', () => {
    addToEditLock(tmpDir, ['a.gts', 'b.gts']);
    const lock = removeFromEditLock(tmpDir);
    expect(lock).toBeNull();
    expect(fs.existsSync(path.join(tmpDir, '.boxel-editing.json'))).toBe(false);
  });

  it('returns null when no lock exists', () => {
    expect(removeFromEditLock(tmpDir, ['a.gts'])).toBeNull();
  });

  it('ignores files not in lock', () => {
    addToEditLock(tmpDir, ['a.gts', 'b.gts']);
    const lock = removeFromEditLock(tmpDir, ['nonexistent.gts']);
    expect(lock?.files).toEqual(['a.gts', 'b.gts']);
  });
});

describe('isFileBeingEdited', () => {
  it('returns false when no lock exists', () => {
    expect(isFileBeingEdited(tmpDir, 'test.gts')).toBe(false);
  });

  it('returns true for locked file', () => {
    addToEditLock(tmpDir, ['test.gts']);
    expect(isFileBeingEdited(tmpDir, 'test.gts')).toBe(true);
  });

  it('returns false for unlocked file', () => {
    addToEditLock(tmpDir, ['other.gts']);
    expect(isFileBeingEdited(tmpDir, 'test.gts')).toBe(false);
  });
});

describe('getEditingFiles', () => {
  it('returns empty array when no lock exists', () => {
    expect(getEditingFiles(tmpDir)).toEqual([]);
  });

  it('returns all locked files', () => {
    addToEditLock(tmpDir, ['a.gts', 'b.json']);
    expect(getEditingFiles(tmpDir)).toEqual(['a.gts', 'b.json']);
  });
});
