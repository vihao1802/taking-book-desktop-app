import { createSha256Hasher } from '@taking-book/core';
import { createReadStream } from 'node:fs';

/** Hashes a file's contents; reads are streamed so memory stays bounded for large PDFs. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hasher = createSha256Hasher();
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hasher.update(chunk as Uint8Array));
    stream.on('error', reject);
    stream.on('end', () => resolve(hasher.digestHex()));
  });
}
