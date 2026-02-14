import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  relativeStructuredPathForWorkspaceUrl,
  defaultWorkspacesRoot,
} from '../../src/lib/workspace-paths.js';

describe('relativeStructuredPathForWorkspaceUrl', () => {
  it('uses full hostname for app.boxel.ai', () => {
    const result = relativeStructuredPathForWorkspaceUrl(
      'https://app.boxel.ai/acme-corp/project-atlas/'
    );
    expect(result).toBe('app.boxel.ai/acme-corp/project-atlas');
  });

  it('uses full hostname for realms-staging.stack.cards', () => {
    const result = relativeStructuredPathForWorkspaceUrl(
      'https://realms-staging.stack.cards/acme-corp/sandbox/'
    );
    expect(result).toBe('realms-staging.stack.cards/acme-corp/sandbox');
  });

  it('uses full hostname for realms.stack.cards', () => {
    const result = relativeStructuredPathForWorkspaceUrl(
      'https://realms.stack.cards/acme-corp/production/'
    );
    expect(result).toBe('realms.stack.cards/acme-corp/production');
  });

  it('preserves distinct paths for staging vs production on same base domain', () => {
    const staging = relativeStructuredPathForWorkspaceUrl(
      'https://realms-staging.stack.cards/user/workspace/'
    );
    const production = relativeStructuredPathForWorkspaceUrl(
      'https://realms.stack.cards/user/workspace/'
    );
    expect(staging).not.toBe(production);
    expect(staging).toContain('realms-staging.stack.cards');
    expect(production).toContain('realms.stack.cards');
  });

  it('handles URLs without trailing slash', () => {
    const result = relativeStructuredPathForWorkspaceUrl(
      'https://app.boxel.ai/user/realm'
    );
    expect(result).toBe('app.boxel.ai/user/realm');
  });

  it('handles unknown domains by preserving full hostname', () => {
    const result = relativeStructuredPathForWorkspaceUrl(
      'https://custom-realm.example.com/owner/workspace/'
    );
    expect(result).toBe('custom-realm.example.com/owner/workspace');
  });
});

describe('defaultWorkspacesRoot', () => {
  it('returns ~/boxel-workspaces', () => {
    const result = defaultWorkspacesRoot();
    expect(result).toBe(path.join(os.homedir(), 'boxel-workspaces'));
  });
});
