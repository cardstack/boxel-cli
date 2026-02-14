/**
 * Matrix homeserver response factories.
 * Returns Response objects for the 4 Matrix endpoints used by MatrixClient.
 */
import {
  TEST_USER_ID,
  TEST_ACCESS_TOKEN,
  TEST_DEVICE_ID,
  createMockOpenIdToken,
} from './mock-credentials.js';

export interface MatrixServerState {
  loginShouldFail?: boolean;
  joinedRooms?: string[];
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Handles Matrix endpoints based on URL path.
 * Returns a Response if the URL matches, or null if it doesn't.
 */
export function handleMatrixRequest(
  url: string,
  method: string,
  body: string | undefined,
  state: MatrixServerState,
): Response | null {
  const path = new URL(url).pathname;

  // POST /_matrix/client/v3/login
  if (path === '/_matrix/client/v3/login' && method === 'POST') {
    if (state.loginShouldFail) {
      return jsonResponse({ errcode: 'M_FORBIDDEN', error: 'Invalid password' }, 403);
    }
    return jsonResponse({
      access_token: TEST_ACCESS_TOKEN,
      device_id: TEST_DEVICE_ID,
      user_id: TEST_USER_ID,
    });
  }

  // GET /_matrix/client/v3/joined_rooms
  if (path === '/_matrix/client/v3/joined_rooms' && method === 'GET') {
    return jsonResponse({
      joined_rooms: state.joinedRooms || [],
    });
  }

  // POST /_matrix/client/v3/rooms/{roomId}/join
  if (path.match(/^\/_matrix\/client\/v3\/rooms\/[^/]+\/join$/) && method === 'POST') {
    return jsonResponse({});
  }

  // POST /_matrix/client/v3/user/{userId}/openid/request_token
  if (path.match(/^\/_matrix\/client\/v3\/user\/[^/]+\/openid\/request_token$/) && method === 'POST') {
    return jsonResponse(createMockOpenIdToken());
  }

  return null;
}
