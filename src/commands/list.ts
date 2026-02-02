import { MatrixClient } from '../lib/matrix-client.js';

interface RealmInfo {
  url: string;
  name?: string;
}

export interface ListCommandOptions {
  json?: boolean;
}

async function getRealmServerToken(
  matrixClient: MatrixClient,
  realmServerUrl: string,
): Promise<string> {
  const openIdToken = await matrixClient.getOpenIdToken();
  if (!openIdToken) {
    throw new Error('Failed to get OpenID token from Matrix');
  }

  const response = await fetch(`${realmServerUrl}_server-session`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openIdToken),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get realm server session: ${response.status} - ${text}`);
  }

  const token = response.headers.get('Authorization');
  if (!token) {
    throw new Error('No Authorization header in realm server session response');
  }

  return token;
}

async function fetchAccessibleRealms(
  realmServerUrl: string,
  token: string,
): Promise<Record<string, string>> {
  const response = await fetch(`${realmServerUrl}_realm-auth`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: token,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch accessible realms: ${response.status} - ${text}`);
  }

  return response.json() as Promise<Record<string, string>>;
}

async function fetchRealmInfo(realmUrl: string, token: string): Promise<RealmInfo> {
  try {
    const response = await fetch(realmUrl, {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: token,
      },
    });

    if (response.ok) {
      const data = await response.json() as {
        data?: {
          attributes?: {
            name?: string;
          };
        };
      };
      return {
        url: realmUrl,
        name: data.data?.attributes?.name,
      };
    }
  } catch {
    // Ignore errors fetching realm info
  }

  return { url: realmUrl };
}

export async function listCommand(options: ListCommandOptions): Promise<void> {
  const matrixUrl = process.env.MATRIX_URL;
  const username = process.env.MATRIX_USERNAME;
  const password = process.env.MATRIX_PASSWORD;

  if (!matrixUrl) {
    console.error('MATRIX_URL environment variable is required');
    process.exit(1);
  }

  if (!username || !password) {
    console.error('MATRIX_USERNAME and MATRIX_PASSWORD environment variables are required');
    process.exit(1);
  }

  // Derive realm server URL from Matrix URL
  // Matrix URL like https://matrix.boxel.ai -> Realm server https://app.boxel.ai
  // Or use REALM_SERVER_URL env var if set
  let realmServerUrl = process.env.REALM_SERVER_URL;
  if (!realmServerUrl) {
    // Try to derive from matrix URL
    const matrixUrlObj = new URL(matrixUrl);
    // Common pattern: matrix.X.Y -> app.X.Y or X.Y
    if (matrixUrlObj.hostname.startsWith('matrix.')) {
      realmServerUrl = `${matrixUrlObj.protocol}//app.${matrixUrlObj.hostname.slice(7)}/`;
    } else if (matrixUrlObj.hostname.startsWith('matrix-')) {
      // matrix-staging.stack.cards -> staging.stack.cards
      realmServerUrl = `${matrixUrlObj.protocol}//${matrixUrlObj.hostname.slice(7)}/`;
    } else {
      console.error('Could not derive realm server URL from MATRIX_URL.');
      console.error('Please set REALM_SERVER_URL environment variable.');
      process.exit(1);
    }
  }

  // Ensure trailing slash
  if (!realmServerUrl.endsWith('/')) {
    realmServerUrl += '/';
  }

  try {
    console.log('Logging into Matrix...');
    const matrixClient = new MatrixClient({
      matrixURL: new URL(matrixUrl),
      username,
      password,
    });
    await matrixClient.login();
    console.log('Matrix login successful');

    console.log(`Connecting to realm server: ${realmServerUrl}`);
    const realmServerToken = await getRealmServerToken(matrixClient, realmServerUrl);
    console.log('Realm server authentication successful');

    console.log('Fetching accessible workspaces...\n');
    const realms = await fetchAccessibleRealms(realmServerUrl, realmServerToken);

    const realmUrls = Object.keys(realms);

    if (realmUrls.length === 0) {
      console.log('No workspaces found.');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(realmUrls, null, 2));
      return;
    }

    console.log(`Found ${realmUrls.length} workspace(s):\n`);

    // Fetch info for each realm
    for (const realmUrl of realmUrls) {
      const token = realms[realmUrl];
      const info = await fetchRealmInfo(realmUrl, token);

      if (info.name) {
        console.log(`  ${info.name}`);
        console.log(`    ${realmUrl}`);
      } else {
        console.log(`  ${realmUrl}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('Failed to list workspaces:', error);
    process.exit(1);
  }
}
