import * as path from 'path';
import {
  loadConfig,
  saveConfig,
  initConfig,
  addRealm,
  removeRealm,
  getConfigPath,
  formatRealmSummary,
  generateLLMGuidance,
  type WorkspacesConfig,
  type RealmConfig,
} from '../lib/realm-config.js';

interface AddRealmOptions {
  purpose?: string;
  patterns?: string;
  cardTypes?: string;
  notes?: string;
  default?: boolean;
}

export async function realmsListCommand(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log('No .boxel-workspaces.json found.');
    console.log('Run `boxel realms init` to create one, or `boxel realms add <path>` to add a realm.');
    return;
  }

  console.log('Configured Realms:');
  console.log(formatRealmSummary(config));
}

export async function realmsAddCommand(realmPath: string, options: AddRealmOptions): Promise<void> {
  let config = loadConfig();
  if (!config) {
    config = initConfig();
    console.log('Created .boxel-workspaces.json');
  }

  const realm: RealmConfig = {
    path: realmPath,
    name: path.basename(realmPath),
  };

  if (options.purpose) {
    realm.purpose = options.purpose;
  }
  if (options.patterns) {
    realm.patterns = options.patterns.split(',').map(p => p.trim());
  }
  if (options.cardTypes) {
    realm.cardTypes = options.cardTypes.split(',').map(t => t.trim());
  }
  if (options.notes) {
    realm.notes = options.notes;
  }

  config = addRealm(config, realm);

  if (options.default) {
    config.defaultRealm = realmPath;
  }

  saveConfig(config);
  console.log(`Added realm: ${realm.name} (${realmPath})`);
}

export async function realmsRemoveCommand(realmPath: string): Promise<void> {
  let config = loadConfig();
  if (!config) {
    console.error('No .boxel-workspaces.json found');
    process.exit(1);
  }

  const exists = config.realms.some(r => r.path === realmPath);
  if (!exists) {
    console.error(`Realm not found: ${realmPath}`);
    console.error('Configured realms:');
    config.realms.forEach(r => console.error(`  - ${r.path}`));
    process.exit(1);
  }

  config = removeRealm(config, realmPath);

  if (config.defaultRealm === realmPath) {
    config.defaultRealm = undefined;
  }

  saveConfig(config);
  console.log(`Removed realm: ${realmPath}`);
}

export async function realmsInitCommand(): Promise<void> {
  const configPath = getConfigPath();
  initConfig();
  console.log(`Created ${configPath}`);
}

export async function realmsLlmCommand(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log('No .boxel-workspaces.json found.');
    return;
  }

  console.log(generateLLMGuidance(config));
}

// Legacy flag-based interface (backwards compat)
interface RealmsOptions {
  add?: string;
  remove?: string;
  purpose?: string;
  patterns?: string;
  cardTypes?: string;
  notes?: string;
  default?: boolean;
  llm?: boolean;
  init?: boolean;
}

export async function realmsCommand(options: RealmsOptions): Promise<void> {
  if (options.init) {
    await realmsInitCommand();
    return;
  }

  if (options.add) {
    await realmsAddCommand(options.add, {
      purpose: options.purpose,
      patterns: options.patterns,
      cardTypes: options.cardTypes,
      notes: options.notes,
      default: options.default,
    });
    return;
  }

  if (options.remove) {
    await realmsRemoveCommand(options.remove);
    return;
  }

  if (options.llm) {
    await realmsLlmCommand();
    return;
  }

  // Default: show summary
  await realmsListCommand();
}

export async function updateRealmConfig(
  realmPath: string,
  updates: Partial<RealmConfig>
): Promise<void> {
  let config = loadConfig();
  if (!config) {
    config = initConfig();
  }

  const existingIndex = config.realms.findIndex(r => r.path === realmPath);
  if (existingIndex >= 0) {
    config.realms[existingIndex] = {
      ...config.realms[existingIndex],
      ...updates,
    };
  } else {
    config.realms.push({
      path: realmPath,
      name: path.basename(realmPath),
      ...updates,
    });
  }

  saveConfig(config);
}
