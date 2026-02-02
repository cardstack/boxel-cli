#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { listCommand } from './commands/list.js';
import { syncCommand } from './commands/sync.js';
import { checkCommand } from './commands/check.js';
import { statusCommand } from './commands/status.js';
import { createCommand } from './commands/create.js';
import { historyCommand } from './commands/history.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('boxel')
  .description('CLI tools for syncing files between local directories and Boxel workspaces')
  .version('1.0.0');

program
  .command('push')
  .description('Push local files to a Boxel workspace')
  .argument('<local-dir>', 'The local directory containing files to sync')
  .argument('<workspace-url>', 'The URL of the target workspace (e.g., https://app.boxel.ai/demo/)')
  .option('--delete', 'Delete remote files that do not exist locally')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Upload all files, even if unchanged')
  .action(async (localDir: string, workspaceUrl: string, options: { delete?: boolean; dryRun?: boolean; force?: boolean }) => {
    await pushCommand(localDir, workspaceUrl, options);
  });

program
  .command('pull')
  .description('Pull files from a Boxel workspace to a local directory')
  .argument('<workspace-url>', 'The URL of the source workspace (e.g., https://app.boxel.ai/demo/)')
  .argument('<local-dir>', 'The local directory to sync files to')
  .option('--delete', 'Delete local files that do not exist in the workspace')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (workspaceUrl: string, localDir: string, options: { delete?: boolean; dryRun?: boolean }) => {
    await pullCommand(workspaceUrl, localDir, options);
  });

program
  .command('list')
  .alias('ls')
  .description('List all workspaces you have access to')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    await listCommand(options);
  });

program
  .command('sync')
  .description('Bidirectional sync between local directory and workspace')
  .argument('[workspace]', 'Workspace reference: . | ./path | @user/workspace | https://...')
  .argument('[workspace-url]', 'Workspace URL (only needed if first arg is a local path)')
  .option('--prefer-local', 'Auto-resolve conflicts by keeping local version')
  .option('--prefer-remote', 'Auto-resolve conflicts by keeping remote version')
  .option('--prefer-newest', 'Auto-resolve conflicts by keeping newest version')
  .option('--delete', 'Sync deletions (remove files deleted on either side)')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (workspace: string | undefined, workspaceUrl: string | undefined, options: {
    preferLocal?: boolean;
    preferRemote?: boolean;
    preferNewest?: boolean;
    delete?: boolean;
    dryRun?: boolean;
  }) => {
    // Handle different argument patterns
    const ref = workspace || '.';

    // If it's a local path and no URL provided, resolve from manifest
    if ((ref === '.' || ref.startsWith('./') || ref.startsWith('/')) && !workspaceUrl) {
      // Will be resolved by sync command using manifest
      await syncCommand(ref, '', options);
    } else if (ref.startsWith('@') || ref.startsWith('http')) {
      // @user/workspace or URL - resolve workspace
      await syncCommand(ref, '', options);
    } else if (workspaceUrl) {
      // Traditional: local-dir workspace-url
      await syncCommand(ref, workspaceUrl, options);
    } else {
      await syncCommand(ref, '', options);
    }
  });

program
  .command('check')
  .description('Check if a file is in sync with remote before editing')
  .argument('<file>', 'The file to check')
  .option('--sync', 'Auto-pull if remote has changes and local is unchanged')
  .action(async (file: string, options: { sync?: boolean }) => {
    await checkCommand(file, options);
  });

program
  .command('create')
  .description('Create a new workspace')
  .argument('<endpoint>', 'URL endpoint for the workspace (lowercase, numbers, hyphens)')
  .argument('<name>', 'Display name for the workspace')
  .option('--background <url>', 'Background image URL')
  .option('--icon <url>', 'Icon image URL')
  .action(async (endpoint: string, name: string, options: { background?: string; icon?: string }) => {
    await createCommand(endpoint, name, options);
  });

program
  .command('history')
  .alias('hist')
  .description('View and restore checkpoint history')
  .argument('[workspace]', 'Workspace directory (default: .)')
  .option('-r, --restore [number]', 'Restore a checkpoint (optionally by number or hash)')
  .action(async (workspace: string | undefined, options: { restore?: boolean | string }) => {
    await historyCommand(workspace || '.', options);
  });

program
  .command('status')
  .alias('st')
  .description('Show sync status for workspace - new/changed files on remote and local')
  .argument('[workspace]', 'Workspace reference: . | ./path | @user/workspace (default: .)')
  .option('--all', 'Show status of all your workspaces')
  .option('--pull', 'Pull new and modified files from remote')
  .action(async (workspace: string | undefined, options: { pull?: boolean; all?: boolean }) => {
    await statusCommand(workspace, options);
  });

program
  .command('watch')
  .description('Watch for server changes and create checkpoints automatically')
  .argument('[workspace]', 'Workspace directory (default: .)')
  .option('-i, --interval <seconds>', 'Check interval in seconds (default: 30)', '30')
  .option('-d, --debounce <seconds>', 'Wait for changes to settle before checkpoint (default: 5)', '5')
  .option('-q, --quiet', 'Only show output when changes detected')
  .action(async (workspace: string | undefined, options: { interval?: string; debounce?: string; quiet?: boolean }) => {
    await watchCommand(workspace || '.', {
      interval: options.interval ? parseInt(options.interval) : 30,
      debounce: options.debounce ? parseInt(options.debounce) : 5,
      quiet: options.quiet,
    });
  });

// Add help text for environment variables
program.addHelpText('after', `
Environment Variables (required):
  MATRIX_URL         The Matrix server URL
  MATRIX_USERNAME    Your Matrix username
  MATRIX_PASSWORD    Your Matrix password (or use REALM_SECRET_SEED)
  REALM_SERVER_URL   The realm server URL (for @user/workspace resolution)

Workspace References:
  .                  Current directory (must have .boxel-sync.json)
  ./path             Local path (must have .boxel-sync.json)
  @user/workspace    Resolve from your workspace list
  https://...        Full workspace URL

Examples:
  boxel create my-project "My Project"   Create a new workspace
  boxel list                             List all accessible workspaces

  boxel status                     Check current directory
  boxel status @username/workspace  Check specific workspace by name
  boxel status --all               Check all your workspaces
  boxel status . --pull            Pull remote changes

  boxel sync .                     Sync current directory
  boxel sync @username/workspace    Sync workspace by name
  boxel sync ./cards https://...   Sync with explicit URL (first time setup)

  boxel check ./file.json          Check single file before editing
  boxel check ./file.json --sync   Auto-pull if remote changed

  boxel watch .                    Monitor server, checkpoint changes
  boxel watch . -i 10              Check every 10 seconds
  boxel watch . -q                 Quiet mode (only show changes)

  boxel pull https://... ./local   One-way pull (for read-only realms)
`);

program.parse();
