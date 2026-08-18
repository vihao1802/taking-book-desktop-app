import { describe, expect, it } from 'vitest';
import { deriveCodeChallenge, generateCodeVerifier } from '../src/sync/pkce';
import { toBase64Url } from '../src/sync/base64';

describe('toBase64Url', () => {
  it('encodes bytes to unpadded base64url', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xff]))).toBe('-___');
  });

  it('handles input not aligned to 3 bytes', () => {
    expect(toBase64Url(new Uint8Array([104, 101, 108, 108, 111]))).toBe('aGVsbG8');
  });
});

describe('generateCodeVerifier', () => {
  it('produces a 43-char base64url string for a 32-byte source', () => {
    const verifier = generateCodeVerifier((size) => new Uint8Array(size).fill(1));
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('uses the injected random source', () => {
    let asked = 0;
    const verifier = generateCodeVerifier((size) => {
      asked = size;
      return new Uint8Array(size).fill(7);
    });
    expect(asked).toBe(32);
    expect(verifier).toBe(toBase64Url(new Uint8Array(32).fill(7)));
  });
});

describe('deriveCodeChallenge', () => {
  it('matches the RFC 7636 S256 example', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(deriveCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('is deterministic for a given verifier', () => {
    const verifier = 'abc123';
    expect(deriveCodeChallenge(verifier)).toBe(deriveCodeChallenge(verifier));
  });

  it('changes when the verifier changes', () => {
    expect(deriveCodeChallenge('a')).not.toBe(deriveCodeChallenge('b'));
  });
});