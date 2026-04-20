import { RealmSyncBase, validateMatrixEnvVars, isProtectedFile, type SyncOptions } from '../lib/realm-sync-base.js';
import { CheckpointManager, type CheckpointChange } from '../lib/checkpoint-manager.js';
import { uploadWithBatching, type FileToUpload } from '../lib/batch-upload.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface SyncManifest {
  workspaceUrl: string;
  files: Record<string, string>; // relativePath -> contentHash
}

function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function loadManifest(localDir: string): SyncManifest | null {
  const manifestPath = path.join(localDir, '.boxel-sync.json');
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveManifest(localDir: string, manifest: SyncManifest): void {
  const manifestPath = path.join(localDir, '.boxel-sync.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

interface PushOptions extends SyncOptions {
  deleteRemote?: boolean;
  force?: boolean;
  batch?: boolean;
  batchSize?: number;
}

class RealmPusher extends RealmSyncBase {
  hasError = false;

  constructor(
    private pushOptions: PushOptions,
    matrixUrl: string,
    username: string,
    password: string,
  ) {
    super(pushOptions, matrixUrl, username, password);
  }

  async sync(): Promise<void> {
    console.log(
      `Starting push from ${this.options.localDir} to ${this.options.workspaceUrl}`,
    );

    console.log('Testing workspace access...');
    try {
      await this.getRemoteFileList('');
    } catch (error) {
      console.error('Failed to access workspace:', error);
      throw new Error(
        'Cannot proceed with push: Authentication or access failed. ' +
          'Please check your Matrix credentials and workspace permissions.',
      );
    }
    console.log('Workspace access verified');

    // Get local files
    const localFiles = await this.getLocalFileList();
    console.log(`Found ${localFiles.size} files in local directory`);

    // Load existing manifest for incremental sync
    const manifest = loadManifest(this.options.localDir);
    const newManifest: SyncManifest = {
      workspaceUrl: this.options.workspaceUrl,
      files: {},
    };

    // Determine which files need to be uploaded
    let filesToUpload: Map<string, string> = new Map();

    if (this.pushOptions.force || !manifest || manifest.workspaceUrl !== this.options.workspaceUrl) {
      if (this.pushOptions.force) {
        console.log('Force mode: uploading all files');
      } else if (!manifest) {
        console.log('No sync manifest found, will upload all files');
      } else {
        console.log('Workspace URL changed, will upload all files');
      }
      for (const [relativePath, localPath] of localFiles) {
        if (isProtectedFile(relativePath)) continue;
        filesToUpload.set(relativePath, localPath);
      }
    } else {
      // Compare file hashes against manifest for incremental sync
      console.log('Checking for changed files...');
      let skipped = 0;

      for (const [relativePath, localPath] of localFiles) {
        if (isProtectedFile(relativePath)) {
          skipped++;
          continue;
        }
        const currentHash = computeFileHash(localPath);
        const previousHash = manifest.files[relativePath];

        if (previousHash !== currentHash) {
          filesToUpload.set(relativePath, localPath);
        } else {
          skipped++;
          // Keep the hash in new manifest
          newManifest.files[relativePath] = currentHash;
        }
      }

      if (skipped > 0) {
        console.log(`Skipping ${skipped} unchanged files`);
      }
    }

    if (filesToUpload.size === 0) {
      console.log('No files to upload - everything is up to date');
    } else if (this.pushOptions.batch) {
      // Batch upload mode: .gts files individually (in dependency order), .json via /_atomic
      const batchSize = this.pushOptions.batchSize ?? 10;

      // Determine operation type: 'add' for new files, 'update' for existing
      const remoteFiles = await this.getRemoteFileList();
      const allFiles: FileToUpload[] = Array.from(filesToUpload.entries()).map(([relativePath, localPath]) => ({
        relativePath,
        localPath,
        operation: remoteFiles.has(relativePath) ? 'update' as const : 'add' as const,
      }));

      // Separate definitions from instances
      const { sortDefinitionsFirst } = await import('../lib/batch-upload.js');
      const sorted = sortDefinitionsFirst(allFiles);
      const definitions = sorted.filter(f => f.relativePath.endsWith('.gts'));
      const instances = sorted.filter(f => !f.relativePath.endsWith('.gts'));

      // Upload .gts files individually in dependency order
      if (definitions.length > 0) {
        console.log(`Uploading ${definitions.length} definition(s) in dependency order...`);
        for (const file of definitions) {
          try {
            await this.uploadFile(file.relativePath, file.localPath);
            newManifest.files[file.relativePath] = computeFileHash(file.localPath);
          } catch (error) {
            this.hasError = true;
            console.error(`Error uploading ${file.relativePath}:`, error);
          }
        }
      }

      // Batch upload .json files via /_atomic
      if (instances.length > 0) {
        console.log(`Batch uploading ${instances.length} instance(s) (${batchSize} per batch)...`);
        const jwt = await this.realmAuthClient.getJWT();
        const result = await uploadWithBatching(instances, this.options.workspaceUrl, jwt, {
          batchSize,
          definitionsFirst: false, // already separated
          dryRun: this.options.dryRun,
        });

        // Update manifest for successfully uploaded files
        if (result.uploaded > 0) {
          for (const file of instances) {
            if (fs.existsSync(file.localPath)) {
              newManifest.files[file.relativePath] = computeFileHash(file.localPath);
            }
          }
        }

        if (result.failed > 0) {
          this.hasError = true;
          for (const err of result.errors) {
            console.error(`Error uploading ${err.path}: ${err.error}`);
          }
        }
      }
    } else {
      console.log(`Uploading ${filesToUpload.size} file(s)...`);

      for (const [relativePath, localPath] of filesToUpload) {
        try {
          await this.uploadFile(relativePath, localPath);
          // Add to manifest after successful upload
          newManifest.files[relativePath] = computeFileHash(localPath);
        } catch (error) {
          this.hasError = true;
          console.error(`Error uploading ${relativePath}:`, error);
        }
      }
    }

    // Handle deletion of remote files not present locally
    if (this.pushOptions.deleteRemote) {
      const remoteFiles = await this.getRemoteFileList();
      const filesToDelete = new Set(remoteFiles.keys());

      // Never delete protected files from the server
      for (const relativePath of filesToDelete) {
        if (isProtectedFile(relativePath)) {
          filesToDelete.delete(relativePath);
        }
      }

      for (const relativePath of localFiles.keys()) {
        filesToDelete.delete(relativePath);
      }

      if (filesToDelete.size > 0) {
        console.log(
          `Deleting ${filesToDelete.size} remote files that don't exist locally`,
        );

        for (const relativePath of filesToDelete) {
          try {
            await this.deleteFile(relativePath);
          } catch (error) {
            this.hasError = true;
            console.error(`Error deleting ${relativePath}:`, error);
          }
        }
      }
    }

    // Save manifest for future incremental syncs
    if (!this.options.dryRun) {
      saveManifest(this.options.localDir, newManifest);
    }

    // Create checkpoint for pushed files
    if (!this.options.dryRun && filesToUpload.size > 0) {
      const checkpointManager = new CheckpointManager(this.options.localDir);
      const pushChanges: CheckpointChange[] = Array.from(filesToUpload.keys()).map(f => ({
        file: f,
        status: 'modified' as const,
      }));
      const checkpoint = checkpointManager.createCheckpoint('local', pushChanges);
      if (checkpoint) {
        const tag = checkpoint.isMajor ? '[MAJOR]' : '[minor]';
        console.log(`\n📍 Checkpoint created: ${checkpoint.shortHash} ${tag} ${checkpoint.message}`);
      }
    }

    console.log('Push completed');
  }
}

export interface PushCommandOptions {
  delete?: boolean;
  dryRun?: boolean;
  force?: boolean;
  batch?: boolean;
  batchSize?: number;
}

export async function pushCommand(
  localDir: string,
  workspaceUrl: string,
  options: PushCommandOptions,
): Promise<void> {
  const { matrixUrl, username, password } =
    await validateMatrixEnvVars(workspaceUrl);

  if (!fs.existsSync(localDir)) {
    console.error(`Local directory does not exist: ${localDir}`);
    process.exit(1);
  }

  try {
    const pusher = new RealmPusher(
      {
        workspaceUrl,
        localDir,
        deleteRemote: options.delete,
        dryRun: options.dryRun,
        force: options.force,
        batch: options.batch,
        batchSize: options.batchSize,
      },
      matrixUrl,
      username,
      password,
    );

    await pusher.initialize();
    await pusher.sync();

    if (pusher.hasError) {
      console.log('Push did not complete successfully. View logs for details');
      process.exit(2);
    } else {
      console.log('Push completed successfully');
    }
  } catch (error) {
    console.error('Push failed:', error);
    process.exit(1);
  }
}
