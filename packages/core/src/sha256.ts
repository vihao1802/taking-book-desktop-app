/**
 * Pure SHA-256 implementation with no platform dependencies. Desktop hashes
 * files by feeding node's stream chunks into `createSha256Hasher`; mobile will
 * do the same with its own byte source. Keeping the digest here (instead of
 * node's crypto) means one hash function is shared and tested across platforms.
 */

const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

interface HasherState {
  h: number[];
  buffer: Uint8Array;
  bytesHashed: number;
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function createState(): HasherState {
  return {
    h: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19],
    buffer: new Uint8Array(0),
    bytesHashed: 0,
  };
}

/** A single 64-byte message block update on the running state. */
function compress(state: HasherState, block: Uint8Array): void {
  const w = new Array<number>(64);
  for (let i = 0; i < 16; i++) {
    w[i] =
      (block[i * 4] << 24) |
      (block[i * 4 + 1] << 16) |
      (block[i * 4 + 2] << 8) |
      block[i * 4 + 3];
  }
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }

  let [a, b, c, d, e, f, g, h] = state.h;
  for (let i = 0; i < 64; i++) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }
  state.h = state.h.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) >>> 0);
}

/** Incremental SHA-256: feed arbitrary chunks, then read the hex digest. */
export interface Sha256Hasher {
  update(chunk: Uint8Array): void;
  digestHex(): string;
}

export function createSha256Hasher(): Sha256Hasher {
  const state = createState();

  return {
    update(chunk: Uint8Array): void {
      state.bytesHashed += chunk.byteLength;
      const combined = new Uint8Array(state.buffer.byteLength + chunk.byteLength);
      combined.set(state.buffer);
      combined.set(chunk, state.buffer.byteLength);

      const fullBlocks = Math.floor(combined.byteLength / 64) * 64;
      for (let i = 0; i < fullBlocks; i += 64) {
        compress(state, combined.subarray(i, i + 64));
      }
      state.buffer = combined.subarray(fullBlocks);
    },

    digestHex(): string {
      // Append 0x80, pad with zeros until length ≡ 56 (mod 64), then the
      // 64-bit big-endian bit length. Computed on a copy so the hasher stays
      // reusable after digesting.
      const bitLength = state.bytesHashed * 8;
      const paddingLen = (56 - ((state.buffer.byteLength + 1) % 64) + 64) % 64;
      const final = new Uint8Array(state.buffer.byteLength + 1 + paddingLen + 8);
      final.set(state.buffer);
      final[state.buffer.byteLength] = 0x80;

      const view = new DataView(final.buffer);
      const high = Math.floor(bitLength / 2 ** 32);
      const low = bitLength >>> 0;
      view.setUint32(final.byteLength - 8, high);
      view.setUint32(final.byteLength - 4, low);

      const finalState: HasherState = {
        h: state.h.slice(),
        buffer: new Uint8Array(0),
        bytesHashed: 0,
      };
      for (let i = 0; i < final.byteLength; i += 64) {
        compress(finalState, final.subarray(i, i + 64));
      }

      return finalState.h.map((w) => w.toString(16).padStart(8, '0')).join('');
    },
  };
}

/** Convenience: hash a single byte array. */
export function sha256Hex(input: Uint8Array): string {
  const hasher = createSha256Hasher();
  hasher.update(input);
  return hasher.digestHex();
}
