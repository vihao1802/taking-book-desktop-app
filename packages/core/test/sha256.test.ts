import { describe, expect, it } from 'vitest';
import { createSha256Hasher, sha256Hex } from '../src';

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('sha256Hex', () => {
  it('hashes known vectors', () => {
    expect(sha256Hex(toBytes(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(toBytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(toBytes('The quick brown fox jumps over the lazy dog'))).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });

  it('matches across chunk boundaries', () => {
    const data = toBytes('a'.repeat(200));
    const oneShot = sha256Hex(data);

    const hasher = createSha256Hasher();
    for (let i = 0; i < data.length; i += 17) {
      hasher.update(data.subarray(i, i + 17));
    }
    expect(hasher.digestHex()).toBe(oneShot);
  });

  it('handles single-byte and non-64-multiple inputs', () => {
    const single = sha256Hex(toBytes('x'));
    const hasher = createSha256Hasher();
    hasher.update(toBytes('x'));
    expect(hasher.digestHex()).toBe(single);

    const data = toBytes('not a multiple of sixty four at all, just longer text here');
    expect(data.byteLength % 64).not.toBe(0);
    expect(sha256Hex(data)).toBe(sha256Hex(data));
  });
});
