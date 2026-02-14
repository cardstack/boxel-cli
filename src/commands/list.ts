import { MatrixClient } from '../lib/matrix-client.js';
import { getProfileManager, formatProfileBadge } from '../lib/profile-manager.js';

interface RealmInfo {
  url: string;
  name?: string;
}

export interface ListCommandOptions {
  json?: boolean;
  allAccessible?: boolean;
  hidden?: boolean;
}

interface RealmsAccountData {
  realms?: string[];
}

const APP_BOXEL_REALMS_EVENT_TYPE = 'app.boxel.realms';

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function normalizeRealmList(realms: string[] | undefined): string[] {
  if (!Array.isArray(realms)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of realms) {
    if (typeof entry !== 'string' || !entry.trim()) {
      continue;
    }
    const url = ensureTrailingSlash(entry.trim());
    if (!seen.has(url)) {
      seen.add(url);
      normalized.push(url);
    }
  }
  return normalized;
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
  // Get credentials from profile manager (falls back to env vars)
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();

  if (!credentials) {
    console.error('No credentials found. Run "boxel profile add" or set environment variables.');
    process.exit(1);
  }

  const { matrixUrl, username, password, realmServerUrl: baseRealmServerUrl, profileId } = credentials;

  // Show active profile if using one
  if (profileId) {
    console.log(`${formatProfileBadge(profileId)}\n`);
  }

  let realmServerUrl = baseRealmServerUrl;

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

    console.log('Fetching workspaces...\n');
    const realms = await fetchAccessibleRealms(realmServerUrl, realmServerToken);
    const accessibleRealmUrls = normalizeRealmList(Object.keys(realms));

    const accountData =
      (await matrixClient.getAccountData<RealmsAccountData>(APP_BOXEL_REALMS_EVENT_TYPE)) ?? {};
    const uiRealmUrls = normalizeRealmList(accountData.realms);

    let realmUrls: string[];
    if (options.hidden) {
      const uiSet = new Set(uiRealmUrls);
      realmUrls = accessibleRealmUrls.filter((url) => !uiSet.has(url));
    } else if (options.allAccessible) {
      realmUrls = accessibleRealmUrls;
    } else {
      realmUrls = uiRealmUrls;
    }

    if (realmUrls.length === 0) {
      if (options.hidden) {
        console.log('No hidden workspaces found.');
      } else if (options.allAccessible) {
        console.log('No accessible workspaces found.');
      } else {
        console.log('No workspaces found in your UI list (app.boxel.realms).');
      }
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(realmUrls, null, 2));
      return;
    }

    const modeLabel = options.hidden
      ? 'hidden workspace(s)'
      : options.allAccessible
        ? 'accessible workspace(s)'
        : 'UI workspace(s)';
    console.log(`Found ${realmUrls.length} ${modeLabel}:\n`);

    // Fetch info for each realm
    for (const realmUrl of realmUrls) {
      const token = realms[realmUrl];
      if (!token) {
        console.log(`  ${realmUrl}`);
        console.log('');
        continue;
      }
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
