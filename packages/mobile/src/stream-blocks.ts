import { createSha256Hasher } from '@taking-book/core';

// A multiple of 64 bytes, so the hasher's carry-over buffer stays small between blocks.
export const BLOCK_SIZE_BYTES = 1024 * 1024;

/** Where the blocks of one stream go as they are read; the hasher sees the same blocks. */
export interface BlockSink {
  write(block: Uint8Array): Promise<void>;
}

function joinChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/**
 * Reads a stream in blocks of at least `BLOCK_SIZE_BYTES` (the last may be
 * smaller), because a network-style stream hands out small chunks and each
 * block costs a call across the native bridge.
 *
 * @param stream The bytes to read.
 * @returns The blocks, one at a time, so only one block is in memory.
 */
export async function* readInBlocks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending.push(value);
      pendingBytes += value.byteLength;
      if (pendingBytes < BLOCK_SIZE_BYTES) continue;
      yield joinChunks(pending, pendingBytes);
      pending = [];
      pendingBytes = 0;
    }
    if (pendingBytes > 0) yield joinChunks(pending, pendingBytes);
  } finally {
    // Releases the source early when the caller stops reading because a write failed.
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Hashes a stream with the core hasher while handing every block to a sink, so
 * the file is read once and never held in memory whole.
 *
 * @param stream The bytes to hash and copy.
 * @param sink Receives each block, in order, before the next one is read.
 * @returns The SHA-256 of all the bytes, as lowercase hex.
 */
export async function hashAndCopyStream(stream: ReadableStream<Uint8Array>, sink: BlockSink): Promise<string> {
  const hasher = createSha256Hasher();
  for await (const block of readInBlocks(stream)) {
    hasher.update(block);
    await sink.write(block);
  }
  return hasher.digestHex();
}
