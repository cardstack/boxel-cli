import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  sortDefinitionsFirst,
  createBatches,
  buildAtomicRequest,
  uploadBatch,
  uploadSingleFile,
  uploadWithBatching,
  type FileToUpload,
} from '../../src/lib/batch-upload.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-upload-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sortDefinitionsFirst', () => {
  it('sorts .gts files before .json files', () => {
    const files: FileToUpload[] = [
      { relativePath: 'BlogPost/hello.json', localPath: '/tmp/a', operation: 'add' },
      { relativePath: 'blog-post.gts', localPath: '/tmp/b', operation: 'add' },
      { relativePath: 'Author/john.json', localPath: '/tmp/c', operation: 'add' },
      { relativePath: 'author.gts', localPath: '/tmp/d', operation: 'add' },
    ];

    const sorted = sortDefinitionsFirst(files);

    // .gts files should come first
    expect(sorted[0].relativePath).toBe('author.gts');
    expect(sorted[1].relativePath).toBe('blog-post.gts');
    expect(sorted[2].relativePath).toBe('Author/john.json');
    expect(sorted[3].relativePath).toBe('BlogPost/hello.json');
  });

  it('preserves alphabetical order within each group', () => {
    const files: FileToUpload[] = [
      { relativePath: 'z-card.gts', localPath: '/tmp/a', operation: 'add' },
      { relativePath: 'a-card.gts', localPath: '/tmp/b', operation: 'add' },
      { relativePath: 'm-card.gts', localPath: '/tmp/c', operation: 'add' },
    ];

    const sorted = sortDefinitionsFirst(files);

    expect(sorted[0].relativePath).toBe('a-card.gts');
    expect(sorted[1].relativePath).toBe('m-card.gts');
    expect(sorted[2].relativePath).toBe('z-card.gts');
  });

  it('handles empty array', () => {
    const sorted = sortDefinitionsFirst([]);
    expect(sorted).toEqual([]);
  });

  it('handles single file', () => {
    const files: FileToUpload[] = [
      { relativePath: 'test.json', localPath: '/tmp/a', operation: 'add' },
    ];
    const sorted = sortDefinitionsFirst(files);
    expect(sorted).toEqual(files);
  });

  it('does not mutate original array', () => {
    const files: FileToUpload[] = [
      { relativePath: 'b.json', localPath: '/tmp/a', operation: 'add' },
      { relativePath: 'a.gts', localPath: '/tmp/b', operation: 'add' },
    ];
    const original = [...files];
    sortDefinitionsFirst(files);
    expect(files).toEqual(original);
  });
});

describe('createBatches', () => {
  function createTempFile(relativePath: string, content: string): FileToUpload {
    const localPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, content);
    return { relativePath, localPath, operation: 'add' };
  }

  it('creates single batch for files within limits', () => {
    const files = [
      createTempFile('a.json', '{"a":1}'),
      createTempFile('b.json', '{"b":2}'),
      createTempFile('c.json', '{"c":3}'),
    ];

    const batches = createBatches(files, { batchSize: 10, maxPayloadKB: 512 });

    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(3);
  });

  it('splits into multiple batches based on batchSize', () => {
    const files = [
      createTempFile('a.json', '{}'),
      createTempFile('b.json', '{}'),
      createTempFile('c.json', '{}'),
      createTempFile('d.json', '{}'),
      createTempFile('e.json', '{}'),
    ];

    const batches = createBatches(files, { batchSize: 2, maxPayloadKB: 512 });

    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(2);
    expect(batches[1].length).toBe(2);
    expect(batches[2].length).toBe(1);
  });

  it('splits based on payload size', () => {
    // Each file is about 100 bytes
    const content = '{"data":"' + 'x'.repeat(90) + '"}';
    const files = [
      createTempFile('a.json', content),
      createTempFile('b.json', content),
      createTempFile('c.json', content),
    ];

    // Max 200 bytes, so 2 files per batch
    const batches = createBatches(files, { batchSize: 10, maxPayloadKB: 0.2 });

    expect(batches.length).toBe(2);
  });

  it('puts oversized files in their own batch', () => {
    const normalContent = '{"small":"data"}';
    const hugeContent = '{"big":"' + 'x'.repeat(1000) + '"}';

    const files = [
      createTempFile('small1.json', normalContent),
      createTempFile('huge.json', hugeContent),
      createTempFile('small2.json', normalContent),
    ];

    // Max 500 bytes - huge file exceeds this
    const batches = createBatches(files, { batchSize: 10, maxPayloadKB: 0.5 });

    expect(batches.length).toBe(3);
    // Huge file should be alone
    const hugeBatch = batches.find(b => b.some(f => f.relativePath === 'huge.json'));
    expect(hugeBatch?.length).toBe(1);
  });

  it('handles empty array', () => {
    const batches = createBatches([], { batchSize: 10, maxPayloadKB: 512 });
    expect(batches).toEqual([]);
  });

  it('caches file content for later use', () => {
    const files = [
      createTempFile('a.json', '{"content":"test"}'),
    ];

    createBatches(files, { batchSize: 10, maxPayloadKB: 512 });

    expect(files[0].content).toBe('{"content":"test"}');
  });
});

describe('buildAtomicRequest', () => {
  function createFile(relativePath: string, content: string): FileToUpload {
    return { relativePath, localPath: '/tmp/fake', content, operation: 'add' as const };
  }

  it('builds request with source type for .gts files', () => {
    const files = [
      createFile('my-card.gts', 'export class MyCard extends CardDef {}'),
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/user/workspace/');

    expect(request['atomic:operations'].length).toBe(1);
    const op = request['atomic:operations'][0];
    expect(op.op).toBe('add');
    expect(op.href).toBe('https://realm.test/user/workspace/my-card.gts');
    expect(op.data.type).toBe('source');
    expect(op.data.attributes?.content).toBe('export class MyCard extends CardDef {}');
  });

  it('builds request with card type for .json files', () => {
    const cardJson = {
      data: {
        attributes: { title: 'Hello' },
        meta: { adoptsFrom: { module: './blog-post', name: 'BlogPost' } },
      },
    };
    const files = [
      createFile('BlogPost/hello.json', JSON.stringify(cardJson)),
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/user/workspace/');

    expect(request['atomic:operations'].length).toBe(1);
    const op = request['atomic:operations'][0];
    expect(op.op).toBe('add');
    expect(op.href).toBe('https://realm.test/user/workspace/BlogPost/hello.json');
    expect(op.data.type).toBe('card');
    expect(op.data.attributes?.title).toBe('Hello');
    expect(op.data.meta?.adoptsFrom).toEqual({ module: './blog-post', name: 'BlogPost' });
  });

  it('handles update operations', () => {
    const files: FileToUpload[] = [
      { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'update' },
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/');

    expect(request['atomic:operations'][0].op).toBe('update');
  });

  it('falls back to file type for invalid JSON', () => {
    const files = [
      createFile('bad.json', 'not valid json {{'),
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/');

    const op = request['atomic:operations'][0];
    expect(op.data.type).toBe('file');
    expect(op.data.attributes?.content).toBe('not valid json {{');
  });

  it('handles multiple files', () => {
    const files = [
      createFile('a.gts', 'code1'),
      createFile('b.gts', 'code2'),
      createFile('Card/c.json', '{"data":{"attributes":{"x":1}}}'),
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/');

    expect(request['atomic:operations'].length).toBe(3);
  });

  it('handles card JSON without data wrapper', () => {
    const cardJson = {
      attributes: { name: 'Test' },
    };
    const files = [
      createFile('Card/test.json', JSON.stringify(cardJson)),
    ];

    const request = buildAtomicRequest(files, 'https://realm.test/');

    const op = request['atomic:operations'][0];
    expect(op.data.type).toBe('card');
    expect(op.data.attributes?.name).toBe('Test');
  });
});

describe('uploadSingleFile', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uploads jpg files as binary with octet-stream content type', async () => {
    const localPath = path.join(tmpDir, 'image.jpg');
    const jpgBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
    ]);
    fs.writeFileSync(localPath, jpgBytes);

    let capturedBody: unknown;
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body;
      capturedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const result = await uploadSingleFile(
      { relativePath: 'Product/images/image.jpg', localPath, operation: 'add' },
      'https://realm.test/',
      'test-jwt',
    );

    expect(result.success).toBe(true);
    expect(capturedHeaders?.get('Content-Type')).toBe('application/octet-stream');
    expect(capturedHeaders?.get('Accept')).toBe('*/*');
    expect(Buffer.isBuffer(capturedBody)).toBe(true);
    expect(Buffer.from(capturedBody as Buffer)).toEqual(jpgBytes);
  });

  it('uploads csv files as text with text/csv content type', async () => {
    const localPath = path.join(tmpDir, 'report.csv');
    const csv = 'name,count\nnorthwind,77\n';
    fs.writeFileSync(localPath, csv);

    let capturedBody: unknown;
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body;
      capturedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const result = await uploadSingleFile(
      { relativePath: 'reports/report.csv', localPath, operation: 'add' },
      'https://realm.test/',
      'test-jwt',
    );

    expect(result.success).toBe(true);
    expect(capturedHeaders?.get('Content-Type')).toBe('text/csv');
    expect(typeof capturedBody).toBe('string');
    expect(capturedBody).toBe(csv);
  });
});

describe('uploadBatch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success for dry run without making requests', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const files: FileToUpload[] = [
      { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'add' },
    ];

    const result = await uploadBatch(files, 'https://realm.test/', 'jwt-token', { dryRun: true });

    expect(result.success).toBe(true);
    expect(result.filesUploaded).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uploads files to _atomic endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const files: FileToUpload[] = [
      { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'export class Test {}', operation: 'add' },
    ];

    const result = await uploadBatch(files, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(true);
    expect(result.filesUploaded).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://realm.test/_atomic',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'jwt-token',
        }),
      })
    );
  });

  it('returns error on HTTP failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const files: FileToUpload[] = [
      { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'add' },
    ];

    const result = await uploadBatch(files, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(false);
    expect(result.filesUploaded).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain('500');
  });

  it('parses JSON error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({
        errors: [{ title: 'Validation Error', detail: 'Invalid card format' }]
      })),
    });

    const files: FileToUpload[] = [
      { relativePath: 'test.json', localPath: '/tmp/fake', content: '{}', operation: 'add' },
    ];

    const result = await uploadBatch(files, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('Invalid card format');
  });

  it('handles network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const files: FileToUpload[] = [
      { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'add' },
    ];

    const result = await uploadBatch(files, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('Network error');
  });
});

describe('uploadSingleFile', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success for dry run', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const file: FileToUpload = { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'add' };

    const result = await uploadSingleFile(file, 'https://realm.test/', 'jwt-token', { dryRun: true });

    expect(result.success).toBe(true);
    expect(result.filesUploaded).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uploads single file with POST', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const file: FileToUpload = { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'export class Test {}', operation: 'add' };

    const result = await uploadSingleFile(file, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://realm.test/test.gts',
      expect.objectContaining({
        method: 'POST',
        body: 'export class Test {}',
      })
    );
  });

  it('returns error on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const file: FileToUpload = { relativePath: 'test.gts', localPath: '/tmp/fake', content: 'code', operation: 'add' };

    const result = await uploadSingleFile(file, 'https://realm.test/', 'jwt-token', {});

    expect(result.success).toBe(false);
    expect(result.errors[0].path).toBe('test.gts');
  });
});

describe('uploadWithBatching fallback strategy', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uploads all files successfully in batches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
      { relativePath: 'b.gts', localPath: '/tmp/b', content: 'code2', operation: 'add' },
    ];

    const result = await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', { quiet: true });

    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('falls back to smaller batches on failure', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      // First batch fails, subsequent succeed
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Batch too large') });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });

    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
      { relativePath: 'b.gts', localPath: '/tmp/b', content: 'code2', operation: 'add' },
      { relativePath: 'c.gts', localPath: '/tmp/c', content: 'code3', operation: 'add' },
      { relativePath: 'd.gts', localPath: '/tmp/d', content: 'code4', operation: 'add' },
    ];

    const result = await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {
      quiet: true,
      batchSize: 4, // All in one batch initially
    });

    expect(result.uploaded).toBe(4);
    expect(result.failed).toBe(0);
    // Should have made more calls due to fallback
    expect(callCount).toBeGreaterThan(1);
  });

  it('falls back to individual uploads when smaller batches fail', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      // First two _atomic calls fail (initial batch and first smaller batch)
      // Then individual uploads succeed
      if (url.includes('_atomic') && callCount <= 2) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Batch failed') });
      }
      // After failures, individual or remaining _atomic uploads succeed
      return Promise.resolve({ ok: true, status: 200 });
    });

    // Use 4 files to ensure we get to the individual fallback scenario
    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
      { relativePath: 'b.gts', localPath: '/tmp/b', content: 'code2', operation: 'add' },
      { relativePath: 'c.gts', localPath: '/tmp/c', content: 'code3', operation: 'add' },
      { relativePath: 'd.gts', localPath: '/tmp/d', content: 'code4', operation: 'add' },
    ];

    const result = await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {
      quiet: true,
      batchSize: 4, // All in one batch initially
    });

    expect(result.uploaded).toBe(4);
    expect(result.failed).toBe(0);
    // Should have made multiple calls due to fallback
    expect(callCount).toBeGreaterThan(2);
  });

  it('reports failures when individual uploads also fail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    const files: FileToUpload[] = [
      { relativePath: 'bad.gts', localPath: '/tmp/bad', content: 'code', operation: 'add' },
    ];

    const result = await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', { quiet: true });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('respects dry run mode', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
      { relativePath: 'b.json', localPath: '/tmp/b', content: '{}', operation: 'add' },
    ];

    const result = await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {
      quiet: true,
      dryRun: true,
    });

    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sorts definitions before instances', async () => {
    const uploadOrder: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url.includes('_atomic')) {
        const body = JSON.parse(opts.body);
        for (const op of body['atomic:operations']) {
          uploadOrder.push(op.href.split('/').pop());
        }
      }
      return { ok: true, status: 200 };
    });

    const files: FileToUpload[] = [
      { relativePath: 'Card/instance.json', localPath: '/tmp/a', content: '{}', operation: 'add' },
      { relativePath: 'card.gts', localPath: '/tmp/b', content: 'code', operation: 'add' },
    ];

    await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {
      quiet: true,
      definitionsFirst: true,
    });

    expect(uploadOrder[0]).toBe('card.gts');
    expect(uploadOrder[1]).toBe('instance.json');
  });

  it('applies delay between batches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
      { relativePath: 'b.gts', localPath: '/tmp/b', content: 'code2', operation: 'add' },
    ];

    const startTime = Date.now();
    await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {
      quiet: true,
      batchSize: 1, // Each file in its own batch
      delayMs: 50,
    });
    const elapsed = Date.now() - startTime;

    // Should have waited at least 50ms between the two batches
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });

  it('calls progress callback', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const files: FileToUpload[] = [
      { relativePath: 'a.gts', localPath: '/tmp/a', content: 'code1', operation: 'add' },
    ];

    const messages: string[] = [];
    await uploadWithBatching(files, 'https://realm.test/', 'jwt-token', {}, (msg) => {
      messages.push(msg);
    });

    // Should have some progress messages
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('Uploading'))).toBe(true);
  });
});
