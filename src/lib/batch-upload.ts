/**
 * Batch Upload Support for Boxel CLI
 *
 * Uses the /_atomic endpoint to upload multiple files in a single request,
 * reducing server reindexing and UI flashing during sync operations.
 */

import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes
const FG_GREEN = '\x1b[32m';
const FG_YELLOW = '\x1b[33m';
const FG_CYAN = '\x1b[36m';
const FG_RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface FileToUpload {
  relativePath: string;
  localPath: string;
  content?: string;
  operation: 'add' | 'update';
}

export interface BatchOptions {
  batchSize: number;              // Files per batch (default: 10)
  maxPayloadKB: number;           // Max payload size in KB (default: 512)
  definitionsFirst: boolean;      // Upload .gts before .json (default: true)
  delayMs: number;                // Delay between batches in ms (default: 0)
  quiet: boolean;                 // Suppress per-file output
  dryRun: boolean;                // Don't actually upload
  verbose: boolean;               // Show detailed debug output
}

export interface BatchResult {
  success: boolean;
  filesUploaded: number;
  errors: Array<{ path: string; error: string }>;
  timeMs: number;
}

export interface AtomicOperation {
  op: 'add' | 'update';
  href: string;
  data: {
    type: 'card' | 'source' | 'file';
    attributes?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  };
}

export interface AtomicRequest {
  'atomic:operations': AtomicOperation[];
}

const DEFAULT_OPTIONS: BatchOptions = {
  batchSize: 10,
  maxPayloadKB: 512,
  definitionsFirst: true,
  delayMs: 0,
  quiet: false,
  dryRun: false,
  verbose: false,
};

// Verbose logging helper
function verbose(opts: Partial<BatchOptions>, message: string, ...args: unknown[]): void {
  if (opts.verbose) {
    console.log(`${DIM}[BATCH-VERBOSE]${RESET} ${message}`, ...args);
  }
}

/**
 * Sort files so definitions (.gts) come before instances (.json)
 */
export function sortDefinitionsFirst(files: FileToUpload[]): FileToUpload[] {
  return [...files].sort((a, b) => {
    const aIsDefinition = a.relativePath.endsWith('.gts');
    const bIsDefinition = b.relativePath.endsWith('.gts');

    if (aIsDefinition && !bIsDefinition) return -1;
    if (!aIsDefinition && bIsDefinition) return 1;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Group files into batches respecting size limits
 */
export function createBatches(
  files: FileToUpload[],
  options: Pick<BatchOptions, 'batchSize' | 'maxPayloadKB'>
): FileToUpload[][] {
  const batches: FileToUpload[][] = [];
  let currentBatch: FileToUpload[] = [];
  let currentPayloadSize = 0;
  const maxPayloadBytes = options.maxPayloadKB * 1024;

  for (const file of files) {
    const content = file.content || fs.readFileSync(file.localPath, 'utf8');
    const fileSize = Buffer.byteLength(content, 'utf8');
    file.content = content; // Cache for later use

    // If single file exceeds max payload, give it its own batch
    if (fileSize > maxPayloadBytes) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentPayloadSize = 0;
      }
      batches.push([file]);
      continue;
    }

    // Check if adding this file would exceed limits
    const wouldExceedSize = currentPayloadSize + fileSize > maxPayloadBytes;
    const wouldExceedCount = currentBatch.length >= options.batchSize;

    if (wouldExceedSize || wouldExceedCount) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [file];
      currentPayloadSize = fileSize;
    } else {
      currentBatch.push(file);
      currentPayloadSize += fileSize;
    }
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Build the atomic operations request body
 */
export function buildAtomicRequest(
  files: FileToUpload[],
  realmUrl: string
): AtomicRequest {
  const operations: AtomicOperation[] = files.map(file => {
    const content = file.content || fs.readFileSync(file.localPath, 'utf8');
    const isCard = file.relativePath.endsWith('.json');

    if (isCard) {
      // For cards, parse and send the card data directly
      try {
        const cardJson = JSON.parse(content);
        // The card JSON has a "data" wrapper - extract it
        const cardData = cardJson.data || cardJson;
        return {
          op: file.operation,
          href: `${realmUrl}${file.relativePath}`,
          data: {
            type: 'card',
            attributes: cardData.attributes || {},
            meta: cardData.meta || {},
            relationships: cardData.relationships || {},
          },
        };
      } catch {
        // If parsing fails, fall back to source format
        return {
          op: file.operation,
          href: `${realmUrl}${file.relativePath}`,
          data: {
            type: 'file',
            attributes: {
              content: content,
            },
          },
        };
      }
    } else {
      // For source files (.gts, etc.), send as content
      return {
        op: file.operation,
        href: `${realmUrl}${file.relativePath}`,
        data: {
          type: 'source',
          attributes: {
            content: content,
          },
        },
      };
    }
  });

  return { 'atomic:operations': operations };
}

/**
 * Upload a batch of files using the /_atomic endpoint
 */
export async function uploadBatch(
  files: FileToUpload[],
  realmUrl: string,
  jwt: string,
  options: Partial<BatchOptions> = {}
): Promise<BatchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  verbose(opts, `uploadBatch called with ${files.length} files`);
  verbose(opts, `Files: ${files.map(f => f.relativePath).join(', ')}`);

  if (opts.dryRun) {
    verbose(opts, 'Dry run mode - skipping actual upload');
    return {
      success: true,
      filesUploaded: files.length,
      errors: [],
      timeMs: Date.now() - startTime,
    };
  }

  const requestBody = buildAtomicRequest(files, realmUrl);
  const atomicUrl = `${realmUrl}_atomic`;

  verbose(opts, `Atomic URL: ${atomicUrl}`);
  verbose(opts, `Request body operations: ${requestBody['atomic:operations'].length}`);
  if (opts.verbose) {
    // Show first operation as sample
    const firstOp = requestBody['atomic:operations'][0];
    if (firstOp) {
      console.log(`${DIM}[BATCH-VERBOSE] Sample operation:${RESET}`);
      console.log(`${DIM}  op: ${firstOp.op}, href: ${firstOp.href}${RESET}`);
      console.log(`${DIM}  data.type: ${firstOp.data.type}${RESET}`);
      if (firstOp.data.attributes) {
        const attrKeys = Object.keys(firstOp.data.attributes);
        console.log(`${DIM}  data.attributes keys: ${attrKeys.join(', ')}${RESET}`);
      }
      if (firstOp.data.meta) {
        console.log(`${DIM}  data.meta: ${JSON.stringify(firstOp.data.meta).slice(0, 100)}...${RESET}`);
      }
    }
  }

  try {
    verbose(opts, 'Sending POST request to _atomic endpoint...');
    const response = await fetch(atomicUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
        'Authorization': jwt,
      },
      body: JSON.stringify(requestBody),
    });

    verbose(opts, `Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = errorText;

      verbose(opts, `Error response body: ${errorText.slice(0, 500)}`);

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors) {
          errorDetail = errorJson.errors.map((e: any) => e.detail || e.title).join(', ');
          if (opts.verbose) {
            console.log(`${FG_RED}[BATCH-VERBOSE] Parsed errors:${RESET}`);
            errorJson.errors.forEach((e: any, i: number) => {
              console.log(`${FG_RED}  [${i}] ${e.title}: ${e.detail}${RESET}`);
              if (e.source) console.log(`${FG_RED}      source: ${JSON.stringify(e.source)}${RESET}`);
            });
          }
        }
      } catch {
        // Use raw text
      }

      return {
        success: false,
        filesUploaded: 0,
        errors: [{ path: 'batch', error: `HTTP ${response.status}: ${errorDetail}` }],
        timeMs: Date.now() - startTime,
      };
    }

    verbose(opts, `Batch upload successful`);

    return {
      success: true,
      filesUploaded: files.length,
      errors: [],
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      filesUploaded: 0,
      errors: [{ path: 'batch', error: String(error) }],
      timeMs: Date.now() - startTime,
    };
  }
}

/**
 * Upload a single file (fallback when batch fails)
 */
export async function uploadSingleFile(
  file: FileToUpload,
  realmUrl: string,
  jwt: string,
  options: Partial<BatchOptions> = {}
): Promise<BatchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  if (opts.dryRun) {
    return {
      success: true,
      filesUploaded: 1,
      errors: [],
      timeMs: Date.now() - startTime,
    };
  }

  const content = file.content || fs.readFileSync(file.localPath, 'utf8');
  const url = `${realmUrl}${file.relativePath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Authorization': jwt,
        'Accept': 'application/vnd.card+source',
      },
      body: content,
    });

    if (!response.ok) {
      return {
        success: false,
        filesUploaded: 0,
        errors: [{ path: file.relativePath, error: `HTTP ${response.status}` }],
        timeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      filesUploaded: 1,
      errors: [],
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      filesUploaded: 0,
      errors: [{ path: file.relativePath, error: String(error) }],
      timeMs: Date.now() - startTime,
    };
  }
}

/**
 * Upload files with batching, fallback to smaller batches, then individual files
 */
export async function uploadWithBatching(
  files: FileToUpload[],
  realmUrl: string,
  jwt: string,
  options: Partial<BatchOptions> = {},
  onProgress?: (message: string) => void
): Promise<{
  totalFiles: number;
  uploaded: number;
  failed: number;
  batches: number;
  timeMs: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  const log = onProgress || console.log;

  verbose(opts, `uploadWithBatching called with ${files.length} files`);
  verbose(opts, `Options: batchSize=${opts.batchSize}, definitionsFirst=${opts.definitionsFirst}, quiet=${opts.quiet}`);

  // Sort definitions first if requested
  let sortedFiles = opts.definitionsFirst ? sortDefinitionsFirst(files) : files;
  verbose(opts, `After sorting: ${sortedFiles.map(f => f.relativePath).join(', ')}`);

  // Create batches
  const batches = createBatches(sortedFiles, opts);
  verbose(opts, `Created ${batches.length} batches`);

  let totalUploaded = 0;
  let totalFailed = 0;
  const allErrors: Array<{ path: string; error: string }> = [];
  let batchCount = 0;

  if (!opts.quiet) {
    const totalSize = sortedFiles.reduce((sum, f) => {
      const content = f.content || fs.readFileSync(f.localPath, 'utf8');
      f.content = content;
      return sum + Buffer.byteLength(content, 'utf8');
    }, 0);
    log(`\n${FG_CYAN}Uploading ${files.length} files in ${batches.length} batch(es)${RESET} ${DIM}(${Math.round(totalSize / 1024)}KB total)${RESET}`);
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    batchCount++;

    if (!opts.quiet) {
      const batchTypes = batch.reduce((acc, f) => {
        const ext = path.extname(f.relativePath);
        acc[ext] = (acc[ext] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const typeStr = Object.entries(batchTypes).map(([ext, count]) => `${count} ${ext}`).join(', ');
      log(`${DIM}[Batch ${i + 1}/${batches.length}]${RESET} ${batch.length} files (${typeStr})`);
    }

    if (opts.dryRun) {
      if (!opts.quiet) {
        for (const file of batch) {
          log(`  ${DIM}[DRY RUN]${RESET} Would upload: ${file.relativePath}`);
        }
      }
      totalUploaded += batch.length;
      continue;
    }

    // Try batch upload
    let result = await uploadBatch(batch, realmUrl, jwt, opts);

    if (!result.success && batch.length > 1) {
      // Try smaller batches (half size)
      if (!opts.quiet) {
        log(`  ${FG_YELLOW}Batch failed, trying smaller batches...${RESET}`);
      }

      const smallerBatches = createBatches(batch, {
        ...opts,
        batchSize: Math.max(1, Math.floor(batch.length / 2))
      });

      for (const smallBatch of smallerBatches) {
        const smallResult = await uploadBatch(smallBatch, realmUrl, jwt, opts);

        if (!smallResult.success && smallBatch.length > 1) {
          // Fall back to individual uploads
          if (!opts.quiet) {
            log(`  ${FG_YELLOW}Smaller batch failed, uploading individually...${RESET}`);
          }

          for (const file of smallBatch) {
            const singleResult = await uploadSingleFile(file, realmUrl, jwt, opts);
            if (singleResult.success) {
              totalUploaded++;
              if (!opts.quiet) {
                log(`  ${FG_GREEN}✓${RESET} ${file.relativePath}`);
              }
            } else {
              totalFailed++;
              allErrors.push(...singleResult.errors);
              if (!opts.quiet) {
                log(`  ${FG_RED}✗${RESET} ${file.relativePath}: ${singleResult.errors[0]?.error}`);
              }
            }
          }
        } else if (smallResult.success) {
          totalUploaded += smallBatch.length;
          if (!opts.quiet) {
            log(`  ${FG_GREEN}✓${RESET} ${smallBatch.length} files ${DIM}(${smallResult.timeMs}ms)${RESET}`);
          }
        } else {
          // Single file batch failed
          totalFailed += smallBatch.length;
          allErrors.push(...smallResult.errors);
          if (!opts.quiet) {
            log(`  ${FG_RED}✗${RESET} ${smallBatch[0].relativePath}: ${smallResult.errors[0]?.error}`);
          }
        }
      }
    } else if (result.success) {
      totalUploaded += batch.length;
      if (!opts.quiet) {
        log(`  ${FG_GREEN}✓${RESET} ${batch.length} files ${DIM}(${result.timeMs}ms)${RESET}`);
      }
    } else {
      // Single file batch failed
      totalFailed += batch.length;
      allErrors.push(...result.errors);
      if (!opts.quiet) {
        log(`  ${FG_RED}✗${RESET} Batch failed: ${result.errors[0]?.error}`);
      }
    }

    // Delay between batches if requested
    if (opts.delayMs > 0 && i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, opts.delayMs));
    }
  }

  const totalTime = Date.now() - startTime;

  if (!opts.quiet) {
    if (totalFailed === 0) {
      log(`\n${FG_GREEN}Upload complete:${RESET} ${totalUploaded} files in ${batchCount} batch(es) ${DIM}(${totalTime}ms)${RESET}`);
    } else {
      log(`\n${FG_YELLOW}Upload complete:${RESET} ${totalUploaded} succeeded, ${FG_RED}${totalFailed} failed${RESET} ${DIM}(${totalTime}ms)${RESET}`);
    }
  }

  return {
    totalFiles: files.length,
    uploaded: totalUploaded,
    failed: totalFailed,
    batches: batchCount,
    timeMs: totalTime,
    errors: allErrors,
  };
}
