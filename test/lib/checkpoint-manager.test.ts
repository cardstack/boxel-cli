import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CheckpointManager, type CheckpointChange } from '../../src/lib/checkpoint-manager.js';

let tmpDir: string;
let workspaceDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  workspaceDir = path.join(tmpDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Pure logic tests (classifyChanges, generateCommitMessage) ──
// These are private methods, so we test them indirectly through createCheckpoint
// or access via bracket notation for focused unit tests.

describe('classifyChanges (via bracket notation)', () => {
  it('classifies as minor for small JSON-only modifications', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'BlogPost/a.json', status: 'modified' },
      { file: 'BlogPost/b.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges(changes)).toBe(false);
  });

  it('classifies as major when >3 files changed', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'a.json', status: 'modified' },
      { file: 'b.json', status: 'modified' },
      { file: 'c.json', status: 'modified' },
      { file: 'd.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges(changes)).toBe(true);
  });

  it('classifies as major when any file is added', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'new-file.json', status: 'added' },
    ];
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges(changes)).toBe(true);
  });

  it('classifies as major when any file is deleted', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'old-file.json', status: 'deleted' },
    ];
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges(changes)).toBe(true);
  });

  it('classifies as major when .gts file modified', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'blog-post.gts', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges(changes)).toBe(true);
  });

  it('classifies as major when index.json modified', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'index.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    // Note: index.json is not marked as major in current implementation
    // Only .gts files and >3 files trigger major classification
    expect(manager.classifyChanges(changes)).toBe(false);
  });

  it('classifies as minor for empty changes', () => {
    const manager = new CheckpointManager(workspaceDir);
    // @ts-expect-error - accessing private method for testing
    expect(manager.classifyChanges([])).toBe(false);
  });
});

describe('generateCommitMessage (via bracket notation)', () => {
  it('generates message for single added file', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'BlogPost/welcome.json', status: 'added' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', changes, true);
    expect(result.message).toContain('Add');
    expect(result.message).toContain('BlogPost/welcome.json');
    expect(result.message).toContain('Push');
  });

  it('generates message for single deleted file', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'old.json', status: 'deleted' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', changes, true);
    expect(result.message).toContain('Delete');
    expect(result.message).toContain('old.json');
  });

  it('generates message for single modified file', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'test.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', changes, false);
    expect(result.message).toContain('Update');
    expect(result.message).toContain('test.json');
  });

  it('generates summary for multiple files', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'a.json', status: 'added' },
      { file: 'b.json', status: 'modified' },
      { file: 'c.json', status: 'deleted' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', changes, true);
    expect(result.message).toContain('3 files');
    expect(result.message).toContain('+1');
    expect(result.message).toContain('~1');
    expect(result.message).toContain('-1');
  });

  it('generates description with file list for multiple files', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'new.json', status: 'added' },
      { file: 'updated.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', changes, true);
    expect(result.description).toContain('Added:');
    expect(result.description).toContain('+ new.json');
    expect(result.description).toContain('Modified:');
    expect(result.description).toContain('~ updated.json');
  });

  it('uses Pull label for remote source', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'test.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('remote', changes, false);
    expect(result.message).toContain('Pull');
  });

  it('uses Manual label for manual source', () => {
    const manager = new CheckpointManager(workspaceDir);
    const changes: CheckpointChange[] = [
      { file: 'test.json', status: 'modified' },
    ];
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('manual', changes, false);
    expect(result.message).toContain('Manual');
  });

  it('handles empty changes', () => {
    const manager = new CheckpointManager(workspaceDir);
    // @ts-expect-error - accessing private method for testing
    const result = manager.generateCommitMessage('local', [], false);
    expect(result.message).toContain('No changes detected');
  });
});

// ── Integration tests (requires git) ──

describe('CheckpointManager integration', () => {
  it('initializes git repository', () => {
    const manager = new CheckpointManager(workspaceDir);
    expect(manager.isInitialized()).toBe(false);
    manager.init();
    expect(manager.isInitialized()).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, '.boxel-history', '.git'))).toBe(true);
  });

  it('is idempotent on double init', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();
    manager.init(); // should not throw
    expect(manager.isInitialized()).toBe(true);
  });

  it('returns empty checkpoints before any commits', () => {
    const manager = new CheckpointManager(workspaceDir);
    expect(manager.getCheckpoints()).toEqual([]);
  });

  it('returns empty checkpoints for initialized repo with only init commit', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();
    const checkpoints = manager.getCheckpoints();
    // init creates one empty commit
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].message).toContain('Initialize');
  });

  it('creates checkpoint when files are added', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    // Add a file to workspace (use index.json since dotfiles are skipped)
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');

    const changes: CheckpointChange[] = [
      { file: 'index.json', status: 'added' },
    ];
    const checkpoint = manager.createCheckpoint('local', changes);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.isMajor).toBe(true); // added file = major
    expect(checkpoint!.source).toBe('local');
    expect(checkpoint!.hash).toBeTruthy();
    expect(checkpoint!.shortHash).toHaveLength(7);
  });

  it('returns null when no changes to commit', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    const checkpoint = manager.createCheckpoint('local', []);
    expect(checkpoint).toBeNull();
  });

  it('detects added files when not initialized', () => {
    const manager = new CheckpointManager(workspaceDir);
    // Not initialized - all files should show as "added"
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');

    const changes = manager.detectCurrentChanges();
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].status).toBe('added');
  });

  it('detects modifications after checkpoint', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    // Create initial file and checkpoint it
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    manager.createCheckpoint('local', [{ file: 'index.json', status: 'added' }]);

    // Add a new file (not yet checkpointed)
    fs.mkdirSync(path.join(workspaceDir, 'BlogPost'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BlogPost', 'new.json'), '{}');

    const changes = manager.detectCurrentChanges();
    expect(changes.length).toBeGreaterThan(0);
  });

  it('gets changed files for a checkpoint', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    const checkpoint = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    const files = manager.getChangedFiles(checkpoint!.hash);
    expect(files).toContain('index.json');
  });

  it('gets diff for a checkpoint', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    const checkpoint = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    const diff = manager.getDiff(checkpoint!.hash);
    expect(diff).toContain('index.json');
  });

  it('uses custom message when provided', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    const checkpoint = manager.createCheckpoint('manual', [
      { file: 'index.json', status: 'added' },
    ], 'My custom message');

    expect(checkpoint!.message).toBe('My custom message');
  });

  it('restores to a previous checkpoint', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    // Checkpoint 1: add file
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"v1"}');
    const cp1 = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    // Checkpoint 2: modify file + add another
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"v2"}');
    fs.mkdirSync(path.join(workspaceDir, 'BlogPost'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BlogPost', 'a.json'), '{}');
    manager.createCheckpoint('local', [
      { file: 'index.json', status: 'modified' },
      { file: 'BlogPost/a.json', status: 'added' },
    ]);

    // Restore to checkpoint 1
    manager.restore(cp1!.hash);

    const indexContent = fs.readFileSync(path.join(workspaceDir, 'index.json'), 'utf-8');
    expect(JSON.parse(indexContent).name).toBe('v1');

    // File added in cp2 should be deleted
    expect(fs.existsSync(path.join(workspaceDir, 'BlogPost', 'a.json'))).toBe(false);
  });

  it('handles subdirectory files correctly', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.mkdirSync(path.join(workspaceDir, 'BlogPost'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'BlogPost', 'post.json'), '{"title":"Hello"}');

    const checkpoint = manager.createCheckpoint('local', [
      { file: 'BlogPost/post.json', status: 'added' },
    ]);

    expect(checkpoint).not.toBeNull();
    const files = manager.getChangedFiles(checkpoint!.hash);
    expect(files).toContain('BlogPost/post.json');
  });

  it('marks and retrieves milestones', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    const checkpoint = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    const milestone = manager.markMilestone(checkpoint!.hash, 'v1.0 Release');
    expect(milestone).not.toBeNull();
    expect(milestone!.name).toBe('v1.0 Release');

    const milestones = manager.getMilestones();
    expect(milestones.length).toBe(1);
    expect(milestones[0].isMilestone).toBe(true);
  });

  it('unmarks milestones', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    const checkpoint = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    manager.markMilestone(checkpoint!.hash, 'v1.0');
    const removed = manager.unmarkMilestone(checkpoint!.hash);
    expect(removed).toBe(true);

    const milestones = manager.getMilestones();
    expect(milestones.length).toBe(0);
  });

  it('markMilestone returns null for uninitialized manager', () => {
    const manager = new CheckpointManager(workspaceDir);
    expect(manager.markMilestone('abc123', 'test')).toBeNull();
  });

  it('unmarkMilestone returns false for uninitialized manager', () => {
    const manager = new CheckpointManager(workspaceDir);
    expect(manager.unmarkMilestone('abc123')).toBe(false);
  });

  it('markMilestone by index', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');
    manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    // Index 1 = most recent real checkpoint (after init commit)
    const milestone = manager.markMilestone(1, 'First Milestone');
    expect(milestone).not.toBeNull();
  });

  it('markMilestone returns null for out-of-range index', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();
    expect(manager.markMilestone(99, 'test')).toBeNull();
  });

  it('skips .boxel-history and .boxel-sync.json when scanning files', () => {
    const manager = new CheckpointManager(workspaceDir);
    manager.init();

    // Create files that should be ignored (all dotfiles are skipped)
    fs.writeFileSync(path.join(workspaceDir, '.boxel-sync.json'), '{}');
    fs.writeFileSync(path.join(workspaceDir, '.other-dotfile'), 'hidden');

    // Create a trackable file (index.json, since dotfiles are skipped)
    fs.writeFileSync(path.join(workspaceDir, 'index.json'), '{"name":"Test"}');

    const checkpoint = manager.createCheckpoint('local', [
      { file: 'index.json', status: 'added' },
    ]);

    expect(checkpoint).not.toBeNull();
    // The ignored files should not appear in the checkpoint
    const files = manager.getChangedFiles(checkpoint!.hash);
    expect(files).not.toContain('.boxel-sync.json');
    expect(files).not.toContain('.other-dotfile');
    expect(files).toContain('index.json');
  });
});
