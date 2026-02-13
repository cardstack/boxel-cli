/**
 * Stateful mock Realm server.
 * Maintains a mutable `files` Map that commands read/write to,
 * enabling mid-command state mutation tests (simulating UI activity).
 */
import { TEST_REALM_URL, createMockJWT } from './mock-credentials.js';

export interface RealmFile {
  path: string;
  content: string;
  mtime: number; // seconds since epoch
}

export interface RealmServerState {
  files: Map<string, RealmFile>;
  sessionShouldFail?: boolean;
  failingPaths?: Set<string>;
}

export function createRealmState(initialFiles?: Record<string, { content: string; mtime?: number }>): RealmServerState {
  const files = new Map<string, RealmFile>();
  if (initialFiles) {
    for (const [filePath, info] of Object.entries(initialFiles)) {
      files.set(filePath, {
        path: filePath,
        content: info.content,
        mtime: info.mtime ?? Math.floor(Date.now() / 1000),
      });
    }
  }
  return { files };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function textResponse(body: string, status = 200, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain', ...headers },
  });
}

/**
 * Build a JSONAPI directory listing for a given directory prefix.
 * getRemoteFileList in realm-sync-base.ts expects:
 *   { data: { relationships: { "name": { meta: { kind: "file"|"directory" } } } } }
 */
function buildDirectoryListing(state: RealmServerState, dirPrefix: string, realmUrl: string): Response {
  // Collect immediate children of dirPrefix
  const relationships: Record<string, { meta: { kind: string } }> = {};
  const seenDirs = new Set<string>();

  for (const filePath of state.files.keys()) {
    if (!filePath.startsWith(dirPrefix)) continue;

    const rest = filePath.slice(dirPrefix.length);
    const slashIdx = rest.indexOf('/');

    if (slashIdx === -1) {
      // Direct file child
      relationships[rest] = { meta: { kind: 'file' } };
    } else {
      // Subdirectory
      const dirName = rest.slice(0, slashIdx);
      if (!seenDirs.has(dirName)) {
        seenDirs.add(dirName);
        relationships[dirName] = { meta: { kind: 'directory' } };
      }
    }
  }

  return jsonResponse({
    data: { relationships },
  });
}

/**
 * Build _mtimes response. Returns full URLs as keys.
 */
function buildMtimesResponse(state: RealmServerState, realmUrl: string): Response {
  const mtimes: Record<string, number> = {};
  for (const [filePath, file] of state.files) {
    // Skip dotfiles except .realm.json (matching shouldIgnoreRemoteFile)
    const basename = filePath.split('/').pop() || '';
    if (basename.startsWith('.') && basename !== '.realm.json') continue;

    mtimes[`${realmUrl}${filePath}`] = file.mtime;
  }

  return jsonResponse({
    data: {
      attributes: { mtimes },
    },
  });
}

/**
 * Handles Realm server endpoints based on URL.
 * Returns a Response if the URL matches, or null if it doesn't.
 */
export function handleRealmRequest(
  url: string,
  method: string,
  body: string | undefined,
  headers: Record<string, string>,
  state: RealmServerState,
  realmUrl: string = TEST_REALM_URL,
): Response | null {
  if (!url.startsWith(realmUrl)) return null;

  const relativePath = url.slice(realmUrl.length);

  // POST _session — returns JWT in Authorization header
  if (relativePath === '_session' && method === 'POST') {
    if (state.sessionShouldFail) {
      return jsonResponse({ error: 'Unauthorized' }, 403);
    }
    const jwt = createMockJWT();
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': jwt,
      },
    });
  }

  // GET _mtimes
  if (relativePath === '_mtimes' && method === 'GET') {
    return buildMtimesResponse(state, realmUrl);
  }

  // GET directory listing (path ends with /)
  if (relativePath.endsWith('/') && method === 'GET') {
    const accept = headers['Accept'] || headers['accept'] || '';
    if (accept.includes('application/vnd.api+json')) {
      return buildDirectoryListing(state, relativePath === '' ? '' : relativePath, realmUrl);
    }
  }

  // Root directory listing (empty relative path)
  if (relativePath === '' && method === 'GET') {
    const accept = headers['Accept'] || headers['accept'] || '';
    if (accept.includes('application/vnd.api+json')) {
      return buildDirectoryListing(state, '', realmUrl);
    }
  }

  // HEAD check (used for .realm.json)
  if (method === 'HEAD') {
    if (state.files.has(relativePath)) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  }

  // GET file content
  if (method === 'GET' && !relativePath.endsWith('/')) {
    // Check for intentional failure
    if (state.failingPaths?.has(relativePath)) {
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }

    const file = state.files.get(relativePath);
    if (file) {
      return textResponse(file.content);
    }
    return jsonResponse({ error: 'Not Found' }, 404);
  }

  // POST file upload
  if (method === 'POST' && !relativePath.startsWith('_')) {
    // Check for intentional failure
    if (state.failingPaths?.has(relativePath)) {
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }

    state.files.set(relativePath, {
      path: relativePath,
      content: body || '',
      mtime: Math.floor(Date.now() / 1000),
    });
    return new Response(null, { status: 204 });
  }

  // DELETE file
  if (method === 'DELETE') {
    state.files.delete(relativePath);
    return new Response(null, { status: 204 });
  }

  // QUERY (search) - used by skills command, not needed for pull/push/sync tests
  if (method === 'QUERY') {
    return jsonResponse({ data: [] });
  }

  return null;
}
