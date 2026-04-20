import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_MAP: Record<string, string> = {
  '.gts': 'application/vnd.card+source',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
};

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'application/octet-stream';
}

export function isTextFile(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType === 'application/javascript' ||
    contentType === 'application/typescript' ||
    contentType === 'application/xml' ||
    contentType === 'application/yaml' ||
    contentType === 'application/vnd.card+source' ||
    contentType === 'image/svg+xml'
  );
}

function looksLikeUtf8Text(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }

  if (buffer.includes(0)) {
    return false;
  }

  return !buffer.toString('utf8').includes('\uFFFD');
}

export function readFileForUpload(
  filePath: string,
  localPath: string,
): { content: string | Buffer; contentType: string } {
  const inferredContentType = getContentType(filePath);

  if (isTextFile(inferredContentType)) {
    return {
      content: fs.readFileSync(localPath, 'utf8'),
      contentType: inferredContentType,
    };
  }

  const buffer = fs.readFileSync(localPath);

  if (
    inferredContentType === 'application/octet-stream' &&
    looksLikeUtf8Text(buffer)
  ) {
    return {
      content: buffer.toString('utf8'),
      contentType: 'text/plain',
    };
  }

  return {
    content: buffer,
    // Realm upload endpoints currently use application/octet-stream as the
    // discriminator for binary request parsing, and infer the served content
    // type from the stored file name on GET.
    contentType: 'application/octet-stream',
  };
}
