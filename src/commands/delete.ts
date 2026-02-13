import * as readline from 'readline';
import { MatrixClient } from '../lib/matrix-client.js';
import { getProfileManager, formatProfileBadge } from '../lib/profile-manager.js';

interface RealmsAccountData {
  realms?: string[];
  [key: string]: unknown;
}

export interface RemoveRealmOptions {
  yes?: boolean;
  dryRun?: boolean;
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

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const value = answer.trim().toLowerCase();
      resolve(value === 'y' || value === 'yes');
    });
  });
}

export async function removeRealmCommand(
  workspaceUrlInput: string,
  options: RemoveRealmOptions,
): Promise<void> {
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();

  if (!credentials) {
    console.error('No credentials found. Run "boxel profile add" or set environment variables.');
    process.exit(1);
  }

  const { matrixUrl, username, password, profileId } = credentials;
  const workspaceUrl = ensureTrailingSlash(workspaceUrlInput.trim());

  if (profileId) {
    console.log(`${formatProfileBadge(profileId)}\n`);
  }

  const matrixClient = new MatrixClient({
    matrixURL: new URL(matrixUrl),
    username,
    password,
  });

  try {
    console.log('Logging into Matrix...');
    await matrixClient.login();

    const accountData =
      (await matrixClient.getAccountData<RealmsAccountData>(APP_BOXEL_REALMS_EVENT_TYPE)) ?? {};
    const existing = normalizeRealmList(accountData.realms);

    if (!existing.includes(workspaceUrl)) {
      console.log('Workspace is not in app.boxel.realms. Nothing to remove.');
      return;
    }

    const next = existing.filter((url) => url !== workspaceUrl);

    console.log(`Soft remove target: ${workspaceUrl}`);
    console.log(`Matrix app.boxel.realms: ${existing.length} -> ${next.length}`);

    if (!options.yes && !options.dryRun) {
      const accepted = await confirm('Proceed with soft remove from your workspace list? [y/N]: ');
      if (!accepted) {
        console.log('Cancelled.');
        return;
      }
    }

    if (options.dryRun) {
      console.log('[DRY RUN] No Matrix account data changes sent.');
      return;
    }

    await matrixClient.setAccountData(APP_BOXEL_REALMS_EVENT_TYPE, {
      ...accountData,
      realms: next,
    });

    console.log('✅ Soft remove complete. Realm removed from your workspace list.');
    console.log('Note: this does not delete files from the realm server.');
  } catch (error) {
    console.error('Failed to soft remove realm:', error);
    process.exit(1);
  }
}

