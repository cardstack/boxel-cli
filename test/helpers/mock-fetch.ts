/**
 * Central fetch router that dispatches to Matrix or Realm mock handlers.
 * Tracks all calls for assertions and supports an `onRequest` hook
 * for mutating server state mid-command (simulating concurrent UI activity).
 */
import { TEST_MATRIX_URL, TEST_REALM_URL } from './mock-credentials.js';
import { handleMatrixRequest, type MatrixServerState } from './mock-matrix-server.js';
import { handleRealmRequest, type RealmServerState } from './mock-realm-server.js';

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface MockFetchOptions {
  matrixState?: MatrixServerState;
  realmState: RealmServerState;
  matrixUrl?: string;
  realmUrl?: string;
  /** Fires on every fetch call. Mutate realmState here to simulate concurrent activity. */
  onRequest?: (url: string, method: string) => void;
}

export function createMockFetch(options: MockFetchOptions): {
  mockFetch: typeof fetch;
  calls: FetchCall[];
} {
  const {
    matrixState = {},
    realmState,
    matrixUrl = TEST_MATRIX_URL,
    realmUrl = TEST_REALM_URL,
    onRequest,
  } = options;

  const calls: FetchCall[] = [];

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const rawHeaders = init?.headers || {};
    const headers: Record<string, string> = {};

    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(rawHeaders)) {
      for (const [k, v] of rawHeaders) { headers[k] = v; }
    } else {
      Object.assign(headers, rawHeaders);
    }

    const body = init?.body ? String(init.body) : undefined;

    calls.push({ url, method, headers, body });

    // Fire the hook for concurrent activity simulation
    if (onRequest) {
      onRequest(url, method);
    }

    // Route to Matrix handler
    if (url.startsWith(matrixUrl)) {
      const response = handleMatrixRequest(url, method, body, matrixState);
      if (response) return response;
    }

    // Route to Realm handler
    if (url.startsWith(realmUrl)) {
      const response = handleRealmRequest(url, method, body, headers, realmState, realmUrl);
      if (response) return response;
    }

    // Unmatched URL
    console.warn(`[mock-fetch] Unmatched request: ${method} ${url}`);
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { mockFetch: mockFetch as typeof fetch, calls };
}
