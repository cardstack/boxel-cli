import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  removeRealm,
  addRealm,
  type WorkspacesConfig,
  type RealmConfig,
} from '../../src/lib/realm-config.js';

describe('removeRealm', () => {
  it('removes an existing realm by path', () => {
    const config: WorkspacesConfig = {
      realms: [
        { path: './code', name: 'code' },
        { path: './data', name: 'data' },
      ],
    };
    const result = removeRealm(config, './code');
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].path).toBe('./data');
  });

  it('returns unchanged config when path not found', () => {
    const config: WorkspacesConfig = {
      realms: [
        { path: './code', name: 'code' },
      ],
    };
    const result = removeRealm(config, './nonexistent');
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].path).toBe('./code');
  });

  it('handles empty realms list', () => {
    const config: WorkspacesConfig = { realms: [] };
    const result = removeRealm(config, './anything');
    expect(result.realms).toHaveLength(0);
  });
});

describe('addRealm', () => {
  it('adds a new realm', () => {
    const config: WorkspacesConfig = { realms: [] };
    const realm: RealmConfig = { path: './code', name: 'code' };
    const result = addRealm(config, realm);
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].path).toBe('./code');
  });

  it('updates existing realm with same path', () => {
    const config: WorkspacesConfig = {
      realms: [{ path: './code', name: 'old-name' }],
    };
    const realm: RealmConfig = { path: './code', name: 'new-name', purpose: 'Definitions' };
    const result = addRealm(config, realm);
    expect(result.realms).toHaveLength(1);
    expect(result.realms[0].name).toBe('new-name');
    expect(result.realms[0].purpose).toBe('Definitions');
  });
});
