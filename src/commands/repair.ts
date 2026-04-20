import { MatrixClient } from '../lib/matrix-client.js';
import { getProfileManager, formatProfileBadge } from '../lib/profile-manager.js';
import { getRandomBackgroundURL, iconURLFor } from '../lib/workspace-appearance.js';

interface RepairOptions {
  name?: string;
  icon?: string;
  background?: string;
  matchEndpoint?: boolean;
  includePersonal?: boolean;
  force?: boolean;
  dryRun?: boolean;
  fixIndex?: boolean;
  touchIndex?: boolean;
  reconcileMatrix?: boolean;
}

interface RepairManyOptions {
  owner?: string;
  matchEndpoint?: boolean;
  includePersonal?: boolean;
  force?: boolean;
  dryRun?: boolean;
  fixIndex?: boolean;
  touchIndex?: boolean;
  reconcileMatrix?: boolean;
}

interface RealmConfig {
  name?: string;
  iconURL?: string;
  backgroundURL?: string;
  publishable?: boolean;
  [key: string]: unknown;
}

interface RealmsAccountData {
  realms?: string[];
  [key: string]: unknown;
}

interface RealmAuthMap {
  [realmUrl: string]: string;
}

interface RepairResult {
  realmUrl: string;
  endpoint: string;
  changedConfig: boolean;
  changedIndex: boolean;
  changedCardsGrid: boolean;
}

const APP_BOXEL_REALMS_EVENT_TYPE = 'app.boxel.realms';

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function isMissing(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isBadName(value: unknown): boolean {
  if (isMissing(value)) {
    return true;
  }
  return String(value).trim().toLowerCase() === 'unknown workspace';
}

function isBadAssetURL(value: unknown): boolean {
  if (isMissing(value)) {
    return true;
  }
  return !/^https?:\/\//.test(String(value).trim());
}

function endpointFromRealmUrl(realmUrl: string): string {
  try {
    const parts = new URL(realmUrl).pathname.replace(/^\/|\/$/g, '').split('/');
    return parts[parts.length - 1] ?? 'workspace';
  } catch {
    return 'workspace';
  }
}

function ownerFromRealmUrl(realmUrl: string): string {
  try {
    const parts = new URL(realmUrl).pathname.replace(/^\/|\/$/g, '').split('/');
    return parts[0] ?? '';
  } catch {
    return '';
  }
}

function titleCaseFromEndpoint(realmUrl: string): string {
  const endpoint = endpointFromRealmUrl(realmUrl);
  return endpoint
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCleanUsername(username: string): string {
  return username.replace(/^@/, '').replace(/:.*$/, '');
}

function shouldSkipSpecialRealm(realmUrl: string, includePersonal = false): boolean {
  const endpoint = endpointFromRealmUrl(realmUrl);
  return endpoint === 'personal' && !includePersonal;
}

function normalizeRealmList(realms: string[] | undefined): string[] {
  if (!Array.isArray(realms)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const realmUrl of realms) {
    if (typeof realmUrl !== 'string' || !realmUrl.trim()) {
      continue;
    }
    const normalizedUrl = ensureTrailingSlash(realmUrl.trim());
    if (!seen.has(normalizedUrl)) {
      normalized.push(normalizedUrl);
      seen.add(normalizedUrl);
    }
  }

  return normalized;
}

function shouldRepairIndex(indexJSON: unknown, expectedCardsGridId: string): boolean {
  if (!indexJSON || typeof indexJSON !== 'object') {
    return true;
  }

  const data = (indexJSON as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return true;
  }

  const relationships = (data as { relationships?: unknown }).relationships;
  if (!relationships || typeof relationships !== 'object') {
    return true;
  }

  const cardsGrid = (relationships as Record<string, unknown>).cardsGrid;
  if (!cardsGrid || typeof cardsGrid !== 'object') {
    return true;
  }

  const links = (cardsGrid as { links?: unknown }).links;
  const dataNode = (cardsGrid as { data?: unknown }).data;
  const linkSelf =
    links && typeof links === 'object'
      ? (links as { self?: unknown }).self
      : undefined;
  const linkId =
    dataNode && typeof dataNode === 'object'
      ? (dataNode as { id?: unknown }).id
      : undefined;
  const meta = (data as { meta?: unknown }).meta;
  const adoptsFrom =
    meta && typeof meta === 'object'
      ? (meta as { adoptsFrom?: unknown }).adoptsFrom
      : undefined;
  const adoptsFromModule =
    adoptsFrom && typeof adoptsFrom === 'object'
      ? (adoptsFrom as { module?: unknown }).module
      : undefined;
  const adoptsFromName =
    adoptsFrom && typeof adoptsFrom === 'object'
      ? (adoptsFrom as { name?: unknown }).name
      : undefined;

  const missingOrWrongLink = linkSelf !== './cards-grid';
  const wrongLinkId = typeof linkId === 'string' && linkId !== expectedCardsGridId;
  const wrongBaseCard =
    adoptsFromModule !== 'https://cardstack.com/base/index' || adoptsFromName !== 'IndexCard';

  return missingOrWrongLink || wrongLinkId || wrongBaseCard;
}

function shouldRepairCardsGrid(cardsGridJSON: unknown): boolean {
  if (!cardsGridJSON || typeof cardsGridJSON !== 'object') {
    return true;
  }

  const data = (cardsGridJSON as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return true;
  }

  const type = (data as { type?: unknown }).type;
  const meta = (data as { meta?: unknown }).meta;
  const adoptsFrom =
    meta && typeof meta === 'object'
      ? (meta as { adoptsFrom?: unknown }).adoptsFrom
      : undefined;
  const adoptsFromModule =
    adoptsFrom && typeof adoptsFrom === 'object'
      ? (adoptsFrom as { module?: unknown }).module
      : undefined;
  const adoptsFromName =
    adoptsFrom && typeof adoptsFrom === 'object'
      ? (adoptsFrom as { name?: unknown }).name
      : undefined;

  return (
    type !== 'card' ||
    adoptsFromModule !== 'https://cardstack.com/base/cards-grid' ||
    adoptsFromName !== 'CardsGrid'
  );
}

function buildIndexPayload(realmUrl: string, name: string, touched = false): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    adoptsFrom: {
      module: 'https://cardstack.com/base/index',
      name: 'IndexCard',
    },
  };
  // _touched: timestamp to force realm server re-index/cache refresh
  // This is a workaround — if needed, the server may have an indexing bug
  if (touched) {
    meta._touched = Date.now();
  }

  return {
    data: {
      type: 'card',
      meta,
      relationships: {
        cardsGrid: {
          links: {
            self: './cards-grid',
          },
        },
      },
    },
  };
}

function buildCardsGridPayload(realmUrl: string, name: string): Record<string, unknown> {
  return {
    data: {
      type: 'card',
      meta: {
        adoptsFrom: {
          module: 'https://cardstack.com/base/cards-grid',
          name: 'CardsGrid',
        },
      },
    },
  };
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

async function getRealmAuthMap(
  realmServerUrl: string,
  serverToken: string,
): Promise<RealmAuthMap> {
  const response = await fetch(`${realmServerUrl}_realm-auth`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: serverToken,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch accessible realms: ${response.status} - ${text}`);
  }

  return (await response.json()) as RealmAuthMap;
}

async function fetchJSON<T>(url: string, token: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: token,
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed GET ${url}: ${response.status} - ${text}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string, token: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: token,
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed GET ${url}: ${response.status} - ${text}`);
  }
  return await response.text();
}

function parseJSONSafely(value: string | null): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function inferNameFromIndex(realmUrl: string, token: string): Promise<string | undefined> {
  const indexText = await fetchText(`${realmUrl}index.json`, token);
  const index = parseJSONSafely(indexText) as {
    data?: {
      attributes?: {
        realmName?: string | null;
        cardTitle?: string | null;
      };
    };
  } | null;

  const realmName = index?.data?.attributes?.realmName?.trim();
  if (realmName) {
    return realmName;
  }

  const cardTitle = index?.data?.attributes?.cardTitle?.trim();
  if (cardTitle) {
    return cardTitle;
  }
  return undefined;
}

async function patchRealmConfig(
  realmUrl: string,
  realmToken: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${realmUrl}_config`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: realmToken,
    },
    body: JSON.stringify({
      data: {
        type: 'realm-config',
        attributes,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to patch realm config: ${response.status} - ${text}`);
  }
}

async function uploadTextFile(
  realmUrl: string,
  fileName: string,
  realmToken: string,
  content: string,
): Promise<void> {
  const response = await fetch(`${realmUrl}${fileName}`, {
    method: 'POST',
    headers: {
      Authorization: realmToken,
      Accept: 'application/vnd.card+source',
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload ${fileName}: ${response.status} - ${text}`);
  }
}

async function uploadJSONFile(
  realmUrl: string,
  fileName: string,
  realmToken: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await uploadTextFile(realmUrl, fileName, realmToken, `${JSON.stringify(payload, null, 2)}\n`);
}

async function remoteFileExists(
  realmUrl: string,
  fileName: string,
  realmToken: string,
): Promise<boolean> {
  const response = await fetch(`${realmUrl}${fileName}`, {
    headers: {
      Accept: 'application/json',
      Authorization: realmToken,
    },
  });

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed checking ${fileName}: ${response.status} - ${text}`);
  }
  return true;
}

async function reserveBackupFileName(
  realmUrl: string,
  sourceFileName: 'index.json' | 'cards-grid.json',
  realmToken: string,
): Promise<string> {
  const stem = sourceFileName.replace(/\.json$/, '');
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', 't').replace('Z', 'z');

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const candidate = `${stem}.backup-${stamp}${suffix}.json`;
    const exists = await remoteFileExists(realmUrl, candidate, realmToken);
    if (!exists) {
      return candidate;
    }
  }

  throw new Error(`Unable to reserve backup filename for ${sourceFileName}`);
}

async function backupFileBeforeOverwrite(
  realmUrl: string,
  sourceFileName: 'index.json' | 'cards-grid.json',
  realmToken: string,
  currentContent: string | null,
  dryRun = false,
): Promise<void> {
  if (currentContent === null) {
    return;
  }

  const backupFileName = await reserveBackupFileName(realmUrl, sourceFileName, realmToken);
  console.log(`  Backup: ${sourceFileName} -> ${backupFileName}`);

  if (dryRun) {
    return;
  }

  const backupContent = currentContent.endsWith('\n') ? currentContent : `${currentContent}\n`;
  await uploadTextFile(realmUrl, backupFileName, realmToken, backupContent);
}

function printRepairSummary(result: RepairResult): void {
  const changes: string[] = [];
  if (result.changedConfig) {
    changes.push('.realm.json');
  }
  if (result.changedIndex) {
    changes.push('index.json');
  }
  if (result.changedCardsGrid) {
    changes.push('cards-grid.json');
  }

  if (changes.length === 0) {
    console.log(`  ${result.endpoint}: no changes`);
    return;
  }

  console.log(`  ${result.endpoint}: updated ${changes.join(', ')}`);
}

async function repairSingleRealm(
  realmUrlInput: string,
  realmToken: string,
  options: RepairOptions,
): Promise<RepairResult> {
  const realmUrl = ensureTrailingSlash(realmUrlInput);
  const endpoint = endpointFromRealmUrl(realmUrl);

  const realmConfig = (await fetchJSON<RealmConfig>(`${realmUrl}.realm.json`, realmToken)) ?? {};
  const inferredName = await inferNameFromIndex(realmUrl, realmToken);
  const endpointName = titleCaseFromEndpoint(realmUrl);

  const desiredName = options.name
    ?? (options.matchEndpoint ? endpointName : undefined)
    ?? inferredName
    ?? endpointName;
  const desiredIcon = options.icon ?? iconURLFor(desiredName);
  const desiredBackground = options.background ?? getRandomBackgroundURL();

  const nextName = options.force || isBadName(realmConfig.name)
    ? desiredName
    : realmConfig.name;
  const nextIcon = options.force || isBadAssetURL(realmConfig.iconURL)
    ? desiredIcon
    : realmConfig.iconURL;
  const nextBackground = options.force || isBadAssetURL(realmConfig.backgroundURL)
    ? desiredBackground
    : realmConfig.backgroundURL;

  const configAttributes: Record<string, unknown> = {};
  if (nextName && nextName !== realmConfig.name) {
    configAttributes.name = nextName;
  }
  if (nextIcon && nextIcon !== realmConfig.iconURL) {
    configAttributes.iconURL = nextIcon;
  }
  if (nextBackground && nextBackground !== realmConfig.backgroundURL) {
    configAttributes.backgroundURL = nextBackground;
  }

  const effectiveName = String(nextName ?? inferredName ?? endpointName);
  const expectedCardsGridId = `${realmUrl}cards-grid`;

  const currentIndexText = await fetchText(`${realmUrl}index.json`, realmToken);
  const currentCardsGridText = await fetchText(`${realmUrl}cards-grid.json`, realmToken);
  const currentIndex = parseJSONSafely(currentIndexText);
  const currentCardsGrid = parseJSONSafely(currentCardsGridText);

  const shouldUpdateIndex =
    Boolean(options.fixIndex) &&
    (shouldRepairIndex(currentIndex, expectedCardsGridId) || Boolean(options.touchIndex));
  const shouldUpdateCardsGrid =
    Boolean(options.fixIndex) && shouldRepairCardsGrid(currentCardsGrid);

  if (Object.keys(configAttributes).length > 0) {
    console.log(`  Config: ${String(realmConfig.name ?? '(missing)')} -> ${effectiveName}`);
  }
  if (shouldUpdateIndex) {
    console.log('  Index: normalizing cards-grid relationship and touching meta');
  }
  if (shouldUpdateCardsGrid) {
    console.log('  Cards-grid: restoring default card');
  }

  if (!options.dryRun) {
    if (Object.keys(configAttributes).length > 0) {
      await patchRealmConfig(realmUrl, realmToken, configAttributes);
    }
  }

  if (shouldUpdateCardsGrid) {
    await backupFileBeforeOverwrite(
      realmUrl,
      'cards-grid.json',
      realmToken,
      currentCardsGridText,
      Boolean(options.dryRun),
    );
    if (!options.dryRun) {
      await uploadJSONFile(realmUrl, 'cards-grid.json', realmToken, buildCardsGridPayload(realmUrl, effectiveName));
    }
  }
  if (shouldUpdateIndex) {
    await backupFileBeforeOverwrite(
      realmUrl,
      'index.json',
      realmToken,
      currentIndexText,
      Boolean(options.dryRun),
    );
    if (!options.dryRun) {
      await uploadJSONFile(
        realmUrl,
        'index.json',
        realmToken,
        buildIndexPayload(realmUrl, effectiveName, Boolean(options.touchIndex)),
      );
    }
  }

  return {
    realmUrl,
    endpoint,
    changedConfig: Object.keys(configAttributes).length > 0,
    changedIndex: shouldUpdateIndex,
    changedCardsGrid: shouldUpdateCardsGrid,
  };
}

async function reconcileMatrixRealmList(
  matrixClient: MatrixClient,
  owner: string,
  repairedRealmUrls: string[],
  options: { dryRun?: boolean; includePersonal?: boolean },
): Promise<void> {
  const existingAccountData =
    (await matrixClient.getAccountData<RealmsAccountData>(APP_BOXEL_REALMS_EVENT_TYPE)) ?? {};
  const existingRealms = normalizeRealmList(existingAccountData.realms);

  const repairedSet = new Set(repairedRealmUrls.map(ensureTrailingSlash));
  const nextRealms: string[] = [];

  for (const realmUrl of existingRealms) {
    const realmOwner = ownerFromRealmUrl(realmUrl);
    const isSameOwner = realmOwner === owner;

    if (!isSameOwner) {
      nextRealms.push(realmUrl);
      continue;
    }

    if (shouldSkipSpecialRealm(realmUrl, options.includePersonal)) {
      nextRealms.push(realmUrl);
      continue;
    }

    if (repairedSet.has(realmUrl)) {
      nextRealms.push(realmUrl);
    }
  }

  for (const realmUrl of repairedRealmUrls) {
    if (!nextRealms.includes(realmUrl)) {
      nextRealms.push(realmUrl);
    }
  }

  const changed =
    nextRealms.length !== existingRealms.length ||
    nextRealms.some((realmUrl, index) => realmUrl !== existingRealms[index]);

  if (!changed) {
    console.log('Matrix app.boxel.realms already consistent for repaired realms.');
    return;
  }

  console.log(`Matrix app.boxel.realms update: ${existingRealms.length} -> ${nextRealms.length}`);

  if (options.dryRun) {
    console.log('[DRY RUN] No Matrix account data changes sent.');
    return;
  }

  await matrixClient.setAccountData(APP_BOXEL_REALMS_EVENT_TYPE, {
    ...existingAccountData,
    realms: nextRealms,
  });

  console.log('✅ Matrix app.boxel.realms updated.');
}

async function upsertRealmInMatrixList(
  matrixClient: MatrixClient,
  realmUrl: string,
  dryRun = false,
): Promise<void> {
  const normalizedRealmUrl = ensureTrailingSlash(realmUrl);
  const existingAccountData =
    (await matrixClient.getAccountData<RealmsAccountData>(APP_BOXEL_REALMS_EVENT_TYPE)) ?? {};
  const existingRealms = normalizeRealmList(existingAccountData.realms);

  if (existingRealms.includes(normalizedRealmUrl)) {
    console.log('Matrix app.boxel.realms already includes this realm.');
    return;
  }

  const nextRealms = [...existingRealms, normalizedRealmUrl];
  console.log(`Matrix app.boxel.realms update: ${existingRealms.length} -> ${nextRealms.length}`);

  if (dryRun) {
    console.log('[DRY RUN] No Matrix account data changes sent.');
    return;
  }

  await matrixClient.setAccountData(APP_BOXEL_REALMS_EVENT_TYPE, {
    ...existingAccountData,
    realms: nextRealms,
  });
  console.log('✅ Matrix app.boxel.realms updated.');
}

async function removeRealmFromMatrixList(
  matrixClient: MatrixClient,
  realmUrl: string,
  dryRun = false,
): Promise<void> {
  const normalizedRealmUrl = ensureTrailingSlash(realmUrl);
  const existingAccountData =
    (await matrixClient.getAccountData<RealmsAccountData>(APP_BOXEL_REALMS_EVENT_TYPE)) ?? {};
  const existingRealms = normalizeRealmList(existingAccountData.realms);

  if (!existingRealms.includes(normalizedRealmUrl)) {
    console.log('Matrix app.boxel.realms already does not include this realm.');
    return;
  }

  const nextRealms = existingRealms.filter((entry) => entry !== normalizedRealmUrl);
  console.log(`Matrix app.boxel.realms update: ${existingRealms.length} -> ${nextRealms.length}`);

  if (dryRun) {
    console.log('[DRY RUN] No Matrix account data changes sent.');
    return;
  }

  await matrixClient.setAccountData(APP_BOXEL_REALMS_EVENT_TYPE, {
    ...existingAccountData,
    realms: nextRealms,
  });
  console.log('✅ Matrix app.boxel.realms updated.');
}

function deriveRealmServerUrl(matrixUrl: string, realmServerUrlFromProfile: string): string {
  let realmServerUrl = realmServerUrlFromProfile;
  if (!realmServerUrl) {
    const matrixUrlObj = new URL(matrixUrl);
    if (matrixUrlObj.hostname.startsWith('matrix-')) {
      realmServerUrl = `${matrixUrlObj.protocol}//${matrixUrlObj.hostname.slice(7)}/`;
    } else if (matrixUrlObj.hostname.startsWith('matrix.')) {
      realmServerUrl = `${matrixUrlObj.protocol}//app.${matrixUrlObj.hostname.slice(7)}/`;
    } else {
      throw new Error('Could not derive realm server URL. Set REALM_SERVER_URL.');
    }
  }
  return ensureTrailingSlash(realmServerUrl);
}

export async function repairRealmCommand(
  realmUrlInput: string,
  options: RepairOptions,
): Promise<void> {
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();
  if (!credentials) {
    console.error('No credentials found. Run "boxel profile add" or set environment variables.');
    process.exit(1);
  }

  const { matrixUrl, username, password, realmServerUrl: baseRealmServerUrl, profileId } = credentials;

  if (profileId) {
    console.log(`${formatProfileBadge(profileId)}\n`);
  }

  const realmUrl = ensureTrailingSlash(realmUrlInput);
  if (shouldSkipSpecialRealm(realmUrl, options.includePersonal)) {
    console.log('Skipping special realm "personal" by default.');
    console.log('Use --include-personal to repair it intentionally.');
    return;
  }

  try {
    const realmServerUrl = deriveRealmServerUrl(matrixUrl, baseRealmServerUrl);

    console.log('Logging into Matrix...');
    const matrixClient = new MatrixClient({
      matrixURL: new URL(matrixUrl),
      username,
      password,
    });
    await matrixClient.login();

    const serverToken = await getRealmServerToken(matrixClient, realmServerUrl);
    const realmAuthMap = await getRealmAuthMap(realmServerUrl, serverToken);
    const realmToken = realmAuthMap[realmUrl];

    if (!realmToken) {
      console.log(`Realm is not accessible via realm-auth: ${realmUrl}`);
      if (options.reconcileMatrix) {
        console.log('Removing stale realm URL from Matrix app.boxel.realms...');
        await removeRealmFromMatrixList(matrixClient, realmUrl, Boolean(options.dryRun));
        console.log(options.dryRun ? '✅ Dry run complete.' : '✅ Stale realm removed from Matrix list.');
        return;
      }
      throw new Error(`No realm auth token for ${realmUrl}. Check profile and permissions.`);
    }

    console.log(`Repairing realm: ${realmUrl}`);
    const result = await repairSingleRealm(realmUrl, realmToken, options);
    printRepairSummary(result);

    if (options.reconcileMatrix) {
      await upsertRealmInMatrixList(matrixClient, realmUrl, Boolean(options.dryRun));
    }

    console.log(options.dryRun ? '✅ Dry run complete.' : '✅ Realm repair complete.');
  } catch (error) {
    console.error('Failed to repair realm metadata:', error);
    process.exit(1);
  }
}

export async function repairRealmsCommand(options: RepairManyOptions): Promise<void> {
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();
  if (!credentials) {
    console.error('No credentials found. Run "boxel profile add" or set environment variables.');
    process.exit(1);
  }

  const { matrixUrl, username, password, realmServerUrl: baseRealmServerUrl, profileId } = credentials;

  if (profileId) {
    console.log(`${formatProfileBadge(profileId)}\n`);
  }

  const owner = (options.owner ?? getCleanUsername(username)).replace(/^@/, '').replace(/:.*$/, '');

  try {
    const realmServerUrl = deriveRealmServerUrl(matrixUrl, baseRealmServerUrl);

    console.log('Logging into Matrix...');
    const matrixClient = new MatrixClient({
      matrixURL: new URL(matrixUrl),
      username,
      password,
    });
    await matrixClient.login();

    const serverToken = await getRealmServerToken(matrixClient, realmServerUrl);
    const realmAuthMap = await getRealmAuthMap(realmServerUrl, serverToken);

    const candidateRealmUrls = Object.keys(realmAuthMap)
      .map(ensureTrailingSlash)
      .filter((realmUrl) => ownerFromRealmUrl(realmUrl) === owner)
      .filter((realmUrl) => !shouldSkipSpecialRealm(realmUrl, options.includePersonal))
      .sort();

    if (candidateRealmUrls.length === 0) {
      console.log(`No accessible realms found for owner "${owner}".`);
      return;
    }

    console.log(`Repairing ${candidateRealmUrls.length} realm(s) for owner "${owner}"...`);

    const repairedRealmUrls: string[] = [];
    let changedCount = 0;

    for (const realmUrl of candidateRealmUrls) {
      const realmToken = realmAuthMap[realmUrl];
      if (!realmToken) {
        continue;
      }

      console.log(`\n- ${realmUrl}`);
      const result = await repairSingleRealm(realmUrl, realmToken, {
        matchEndpoint: options.matchEndpoint ?? false,
        includePersonal: options.includePersonal,
        force: options.force,
        dryRun: options.dryRun,
        fixIndex: options.fixIndex ?? false,
        touchIndex: options.touchIndex ?? false,
      });
      printRepairSummary(result);

      repairedRealmUrls.push(result.realmUrl);

      if (result.changedConfig || result.changedIndex || result.changedCardsGrid) {
        changedCount += 1;
      }
    }

    if (options.reconcileMatrix ?? true) {
      console.log('');
      await reconcileMatrixRealmList(matrixClient, owner, repairedRealmUrls, {
        dryRun: options.dryRun,
        includePersonal: options.includePersonal,
      });
    }

    if (options.dryRun) {
      console.log(`\n✅ Dry run complete. ${changedCount}/${candidateRealmUrls.length} realm(s) would change.`);
    } else {
      console.log(`\n✅ Repair complete. ${changedCount}/${candidateRealmUrls.length} realm(s) changed.`);
    }
  } catch (error) {
    console.error('Failed to repair realms:', error);
    process.exit(1);
  }
}
