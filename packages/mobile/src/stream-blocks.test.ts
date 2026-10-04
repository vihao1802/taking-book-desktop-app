import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@taking-book/core';
import { BLOCK_SIZE_BYTES, hashAndCopyStream, readInBlocks } from './stream-blocks';

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function patternedBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + 7) % 256);
}

function splitInto(bytes: Uint8Array, size: number): Uint8Array[] {
  const pieces: Uint8Array[] = [];
  for (let start = 0; start < bytes.byteLength; start += size) pieces.push(bytes.subarray(start, start + size));
  return pieces;
}

describe('readInBlocks', () => {
  it('joins small chunks into blocks and keeps the remainder as a last smaller block', async () => {
    const bytes = patternedBytes(BLOCK_SIZE_BYTES * 2 + 1000);
    const sizes: number[] = [];
    for await (const block of readInBlocks(streamOf(splitInto(bytes, 50_000)))) sizes.push(block.byteLength);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(bytes.byteLength);
    expect(sizes.slice(0, -1).every((size) => size >= BLOCK_SIZE_BYTES)).toBe(true);
  });

  it('yields nothing for an empty stream', async () => {
    const blocks: Uint8Array[] = [];
    for await (const block of readInBlocks(streamOf([]))) blocks.push(block);
    expect(blocks).toEqual([]);
  });
});

describe('hashAndCopyStream', () => {
  it('returns the same digest as hashing the whole file, and copies every byte in order', async () => {
    const bytes = patternedBytes(BLOCK_SIZE_BYTES * 3 + 12_345);
    const copied: Uint8Array[] = [];
    const hash = await hashAndCopyStream(streamOf(splitInto(bytes, 70_001)), {
      write: async (block) => {
        copied.push(block);
      },
    });
    expect(hash).toBe(sha256Hex(bytes));
    const total = copied.reduce((sum, block) => sum + block.byteLength, 0);
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const block of copied) {
      joined.set(block, offset);
      offset += block.byteLength;
    }
    // Compared by digest because toEqual on millions of bytes is very slow.
    expect(sha256Hex(joined)).toBe(hash);
    expect(joined.byteLength).toBe(bytes.byteLength);
  });

  it('holds only a block or two at a time, not the whole file', async () => {
    const chunk = patternedBytes(256 * 1024);
    let delivered = 0;
    let largestBlock = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (delivered === 64) return controller.close();
        delivered += 1;
        controller.enqueue(chunk);
      },
    });
    await hashAndCopyStream(stream, {
      write: async (block) => {
        largestBlock = Math.max(largestBlock, block.byteLength);
      },
    });
    expect(delivered).toBe(64);
    expect(largestBlock).toBeLessThan(BLOCK_SIZE_BYTES * 2);
  });

  it('stops reading and rejects when the sink fails', async () => {
    const bytes = patternedBytes(BLOCK_SIZE_BYTES * 2);
    await expect(
      hashAndCopyStream(streamOf(splitInto(bytes, BLOCK_SIZE_BYTES)), {
        write: () => Promise.reject(new Error('disk full')),
      }),
    ).rejects.toThrow('disk full');
  });
});
