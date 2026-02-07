import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  addRealm,
  removeRealm,
  getRealmForFile,
  getRealmForCardType,
  formatRealmSummary,
  generateLLMGuidance,
  loadConfig,
  saveConfig,
  getConfigPath,
  initConfig,
  type WorkspacesConfig,
  type RealmConfig,
} from '../../src/lib/realm-config.js';

// ── Pure function tests (no filesystem needed) ──

describe('addRealm', () => {
  it('adds a new realm to empty config', () => {
    const config: WorkspacesConfig = { realms: [] };
    const realm: RealmConfig = { path: './code', name: 'Code', purpose: 'Definitions' };
    const result = addRealm(config, realm);
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].name).toBe('Code');
  });

  it('updates existing realm with same path', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', name: 'Old Name', purpose: 'Old' }],
    };
    const result = addRealm(config, { path: './code', name: 'New Name', purpose: 'New' });
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].name).toBe('New Name');
    expect(result.realms[0].purpose).toBe('New');
  });

  it('preserves existing fields when updating', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', name: 'Code', patterns: ['*.gts'], notes: 'Keep me' }],
    };
    const result = addRealm(config, { path: './code', purpose: 'Definitions' });
    expect(result.realms[0].patterns).toEqual(['*.gts']);
    expect(result.realms[0].notes).toBe('Keep me');
    expect(result.realms[0].purpose).toBe('Definitions');
  });

  it('adds multiple different realms', () => {
    let config: WorkspacesConfig = { realms: [] };
    config = addRealm(config, { path: './code' });
    config = addRealm(config, { path: './data' });
    expect(config.realms).toHaveLength(2);
  });
});

describe('removeRealm', () => {
  it('removes realm by path', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code' }, { path: './data' }],
    };
    const result = removeRealm(config, './code');
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].path).toBe('./data');
  });

  it('does nothing when path not found', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code' }],
    };
    const result = removeRealm(config, './nonexistent');
    expect(result.realms).toHaveLength(1);
  });

  it('handles empty realms array', () => {
    const config: WorkspacesConfig = { realms: [] };
    const result = removeRealm(config, './code');
    expect(result.realms).toHaveLength(0);
  });
});

describe('getRealmForFile', () => {
  const config: WorkspacesConfig = {
    defaultRealm: './code',
    realms: [
      { path: './code', patterns: ['*.gts', 'components/**'] },
      { path: './data', patterns: ['*.json'], cardTypes: ['BlogPost'] },
    ],
  };

  it('matches extension pattern', () => {
    const realm = getRealmForFile(config, 'blog-post.gts');
    expect(realm?.path).toBe('./code');
  });

  it('matches directory glob pattern', () => {
    const realm = getRealmForFile(config, 'components/button.gts');
    expect(realm?.path).toBe('./code');
  });

  it('matches json pattern', () => {
    const realm = getRealmForFile(config, 'BlogPost/welcome.json');
    expect(realm?.path).toBe('./data');
  });

  it('returns first matching realm (first-match-wins)', () => {
    // .gts matches first realm
    const realm = getRealmForFile(config, 'test.gts');
    expect(realm?.path).toBe('./code');
  });

  it('falls back to default realm when no pattern matches', () => {
    const realm = getRealmForFile(config, 'README.md');
    expect(realm?.path).toBe('./code');
  });

  it('falls back to first realm when no default set', () => {
    const noDefault: WorkspacesConfig = {
      realms: [
        { path: './alpha' },
        { path: './beta' },
      ],
    };
    const realm = getRealmForFile(noDefault, 'anything.txt');
    expect(realm?.path).toBe('./alpha');
  });

  it('returns null for empty realms', () => {
    const empty: WorkspacesConfig = { realms: [] };
    expect(getRealmForFile(empty, 'file.gts')).toBeNull();
  });

  it('matches wildcard pattern', () => {
    const wildcardConfig: WorkspacesConfig = {
      realms: [{ path: './all', patterns: ['*'] }],
    };
    expect(getRealmForFile(wildcardConfig, 'anything.txt')?.path).toBe('./all');
  });

  it('matches exact filename pattern', () => {
    const exactConfig: WorkspacesConfig = {
      realms: [{ path: './special', patterns: ['.realm.json'] }],
    };
    expect(getRealmForFile(exactConfig, '.realm.json')?.path).toBe('./special');
  });

  it('falls back to first realm for non-matching exact pattern', () => {
    const exactConfig: WorkspacesConfig = {
      realms: [{ path: './special', patterns: ['.realm.json'] }],
    };
    // No pattern matches, but falls back to first realm
    expect(getRealmForFile(exactConfig, 'other.json')?.path).toBe('./special');
  });
});

describe('getRealmForCardType', () => {
  const config: WorkspacesConfig = {
    defaultRealm: './code',
    realms: [
      { path: './code', patterns: ['*.gts'] },
      { path: './data', cardTypes: ['BlogPost', 'Product'] },
    ],
  };

  it('finds realm for matching card type', () => {
    expect(getRealmForCardType(config, 'BlogPost')?.path).toBe('./data');
  });

  it('finds realm for second card type', () => {
    expect(getRealmForCardType(config, 'Product')?.path).toBe('./data');
  });

  it('falls back to default realm for unknown card type', () => {
    expect(getRealmForCardType(config, 'Unknown')?.path).toBe('./code');
  });

  it('falls back to first realm when no default set', () => {
    const noDefault: WorkspacesConfig = {
      realms: [
        { path: './alpha' },
        { path: './beta', cardTypes: ['Specific'] },
      ],
    };
    expect(getRealmForCardType(noDefault, 'Other')?.path).toBe('./alpha');
  });

  it('returns null for empty realms', () => {
    const empty: WorkspacesConfig = { realms: [] };
    expect(getRealmForCardType(empty, 'BlogPost')).toBeNull();
  });
});

describe('formatRealmSummary', () => {
  it('returns message for empty config', () => {
    expect(formatRealmSummary({ realms: [] })).toBe('No realms configured.');
  });

  it('includes realm name and path', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', name: 'Code Realm' }],
    };
    const summary = formatRealmSummary(config);
    expect(summary).toContain('Code Realm');
    expect(summary).toContain('./code');
  });

  it('marks default realm with star', () => {
    const config: WorkspacesConfig = {
      defaultRealm: './code',
      realms: [{ path: './code', name: 'Code' }],
    };
    const summary = formatRealmSummary(config);
    expect(summary).toContain('★');
  });

  it('includes purpose and patterns', () => {
    const config: WorkspacesConfig = {
      realms: [{
        path: './code',
        name: 'Code',
        purpose: 'Card definitions',
        patterns: ['*.gts', '*.ts'],
      }],
    };
    const summary = formatRealmSummary(config);
    expect(summary).toContain('Card definitions');
    expect(summary).toContain('*.gts, *.ts');
  });

  it('includes card types and notes', () => {
    const config: WorkspacesConfig = {
      realms: [{
        path: './data',
        name: 'Data',
        cardTypes: ['BlogPost', 'Product'],
        notes: 'Instance data only',
      }],
    };
    const summary = formatRealmSummary(config);
    expect(summary).toContain('BlogPost, Product');
    expect(summary).toContain('Instance data only');
  });

  it('uses basename as fallback name', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './my-realm' }],
    };
    const summary = formatRealmSummary(config);
    expect(summary).toContain('my-realm');
  });
});

describe('generateLLMGuidance', () => {
  it('returns empty string for empty config', () => {
    expect(generateLLMGuidance({ realms: [] })).toBe('');
  });

  it('includes realm heading and path', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', name: 'Code' }],
    };
    const guidance = generateLLMGuidance(config);
    expect(guidance).toContain('### Code');
    expect(guidance).toContain('`./code`');
  });

  it('marks default realm', () => {
    const config: WorkspacesConfig = {
      defaultRealm: './code',
      realms: [{ path: './code', name: 'Code' }],
    };
    const guidance = generateLLMGuidance(config);
    expect(guidance).toContain('(default)');
  });

  it('includes file placement instruction', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code' }],
    };
    const guidance = generateLLMGuidance(config);
    expect(guidance).toContain('creating new files');
  });

  it('includes default realm fallback instruction', () => {
    const config: WorkspacesConfig = {
      defaultRealm: './code',
      realms: [{ path: './code' }],
    };
    const guidance = generateLLMGuidance(config);
    expect(guidance).toContain('ambiguous');
    expect(guidance).toContain('`./code`');
  });

  it('includes patterns as code formatting', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', patterns: ['*.gts'] }],
    };
    const guidance = generateLLMGuidance(config);
    expect(guidance).toContain('`*.gts`');
  });
});

// ── Filesystem tests ──

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getConfigPath', () => {
  it('returns path to .boxel-workspaces.json in given dir', () => {
    const result = getConfigPath(tmpDir);
    expect(result).toBe(path.join(tmpDir, '.boxel-workspaces.json'));
  });
});

describe('saveConfig + loadConfig', () => {
  it('round-trips config to filesystem', () => {
    const config: WorkspacesConfig = {
      defaultRealm: './code',
      realms: [
        { path: './code', name: 'Code', patterns: ['*.gts'] },
        { path: './data', cardTypes: ['BlogPost'] },
      ],
    };
    const configPath = path.join(tmpDir, '.boxel-workspaces.json');
    saveConfig(config, configPath);
    const loaded = loadConfig(configPath);
    expect(loaded).toEqual(config);
  });

  it('loadConfig returns null for nonexistent file', () => {
    expect(loadConfig(path.join(tmpDir, 'nonexistent.json'))).toBeNull();
  });

  it('loadConfig returns null for invalid JSON', () => {
    const configPath = path.join(tmpDir, '.boxel-workspaces.json');
    fs.writeFileSync(configPath, 'not valid json{{{');
    expect(loadConfig(configPath)).toBeNull();
  });
});

describe('initConfig', () => {
  it('creates a config file with empty realms', () => {
    const config = initConfig(tmpDir);
    expect(config.realms).toEqual([]);

    const configPath = path.join(tmpDir, '.boxel-workspaces.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(loaded.realms).toEqual([]);
  });
});
