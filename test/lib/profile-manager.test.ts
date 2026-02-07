import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getEnvironmentFromMatrixId,
  getUsernameFromMatrixId,
  getDomainFromMatrixId,
  getEnvironmentLabel,
  getEnvironmentShortLabel,
  formatProfileBadge,
  ProfileManager,
  type Environment,
} from '../../src/lib/profile-manager.js';

describe('getEnvironmentFromMatrixId', () => {
  it('returns staging for stack.cards domain', () => {
    expect(getEnvironmentFromMatrixId('@ctse:stack.cards')).toBe('staging');
  });

  it('returns production for boxel.ai domain', () => {
    expect(getEnvironmentFromMatrixId('@ctse:boxel.ai')).toBe('production');
  });

  it('returns unknown for unrecognized domain', () => {
    expect(getEnvironmentFromMatrixId('@user:example.com')).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(getEnvironmentFromMatrixId('')).toBe('unknown');
  });

  it('returns unknown for malformed ID without colon', () => {
    expect(getEnvironmentFromMatrixId('nocolon')).toBe('unknown');
  });
});

describe('getUsernameFromMatrixId', () => {
  it('extracts username from valid matrix ID', () => {
    expect(getUsernameFromMatrixId('@ctse:stack.cards')).toBe('ctse');
  });

  it('extracts username from production ID', () => {
    expect(getUsernameFromMatrixId('@alice:boxel.ai')).toBe('alice');
  });

  it('handles hyphenated usernames', () => {
    expect(getUsernameFromMatrixId('@my-user:boxel.ai')).toBe('my-user');
  });

  it('returns original string for malformed ID', () => {
    expect(getUsernameFromMatrixId('noatsign')).toBe('noatsign');
  });

  it('returns original string for empty string', () => {
    expect(getUsernameFromMatrixId('')).toBe('');
  });
});

describe('getDomainFromMatrixId', () => {
  it('extracts domain from staging ID', () => {
    expect(getDomainFromMatrixId('@ctse:stack.cards')).toBe('stack.cards');
  });

  it('extracts domain from production ID', () => {
    expect(getDomainFromMatrixId('@alice:boxel.ai')).toBe('boxel.ai');
  });

  it('returns unknown for string without colon', () => {
    expect(getDomainFromMatrixId('nocolon')).toBe('unknown');
  });

  it('handles multiple colons (takes last segment)', () => {
    expect(getDomainFromMatrixId('@user:host:port')).toBe('port');
  });
});

describe('getEnvironmentLabel', () => {
  it('returns staging label', () => {
    expect(getEnvironmentLabel('staging')).toContain('stack.cards');
  });

  it('returns production label', () => {
    expect(getEnvironmentLabel('production')).toContain('boxel.ai');
  });

  it('returns unknown label', () => {
    expect(getEnvironmentLabel('unknown')).toContain('unknown');
  });
});

describe('getEnvironmentShortLabel', () => {
  it('returns stack.cards for staging', () => {
    expect(getEnvironmentShortLabel('staging')).toBe('stack.cards');
  });

  it('returns boxel.ai for production', () => {
    expect(getEnvironmentShortLabel('production')).toBe('boxel.ai');
  });

  it('returns unknown for unknown', () => {
    expect(getEnvironmentShortLabel('unknown')).toBe('unknown');
  });
});

describe('formatProfileBadge', () => {
  it('includes username and environment', () => {
    const badge = formatProfileBadge('@ctse:stack.cards');
    expect(badge).toContain('ctse');
    expect(badge).toContain('stack.cards');
  });

  it('works for production IDs', () => {
    const badge = formatProfileBadge('@alice:boxel.ai');
    expect(badge).toContain('alice');
    expect(badge).toContain('boxel.ai');
  });
});

describe('ProfileManager', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-'));
    // Override HOME so ProfileManager reads/writes to temp dir
    originalHome = process.env.HOME || '';
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ProfileManager uses module-level constants for CONFIG_DIR and PROFILES_FILE
  // based on os.homedir() at import time, so we can't easily redirect its file path.
  // Instead, test the logic that doesn't depend on file I/O by constructing
  // ProfileManager and using its in-memory state after construction.

  // Note: ProfileManager reads from ~/.boxel-cli/profiles.json (module-level constant).
  // We can't redirect it to tmpDir, so we test methods that work regardless of existing state.

  it('listProfiles returns an array', () => {
    const manager = new ProfileManager();
    const profiles = manager.listProfiles();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it('getProfile returns undefined for nonexistent profile', () => {
    const manager = new ProfileManager();
    expect(manager.getProfile('@nobody-test-fake:example.com')).toBeUndefined();
  });

  it('getActiveProfileId returns string or null', () => {
    const manager = new ProfileManager();
    const id = manager.getActiveProfileId();
    expect(id === null || typeof id === 'string').toBe(true);
  });

  it('getActiveProfile returns object with id and profile, or null', () => {
    const manager = new ProfileManager();
    const active = manager.getActiveProfile();
    if (active !== null) {
      expect(active).toHaveProperty('id');
      expect(active).toHaveProperty('profile');
      expect(active.profile).toHaveProperty('matrixUrl');
      expect(active.profile).toHaveProperty('realmServerUrl');
    }
  });

  it('getPassword returns null for nonexistent profile', async () => {
    const manager = new ProfileManager();
    expect(await manager.getPassword('@nobody-test-fake:example.com')).toBeNull();
  });

  it('switchProfile returns false for nonexistent profile', () => {
    const manager = new ProfileManager();
    expect(manager.switchProfile('@nobody-test-fake:example.com')).toBe(false);
  });

  it('removeProfile returns false for nonexistent profile', async () => {
    const manager = new ProfileManager();
    expect(await manager.removeProfile('@nobody-test-fake:example.com')).toBe(false);
  });

  it('updatePassword returns false for nonexistent profile', async () => {
    const manager = new ProfileManager();
    expect(await manager.updatePassword('@nobody-test-fake:example.com', 'newpass')).toBe(false);
  });

  it('updateDisplayName returns false for nonexistent profile', () => {
    const manager = new ProfileManager();
    expect(manager.updateDisplayName('@nobody-test-fake:example.com', 'New Name')).toBe(false);
  });
});
