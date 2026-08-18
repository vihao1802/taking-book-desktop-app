import { sha256Hex } from '../sha256';
import { toBase64Url } from './base64';

/**
 * PKCE helpers (RFC 7636) for the OAuth code flow. `generateCodeVerifier`
 * takes the random source as a parameter so core stays platform-agnostic —
 * desktop passes Node's `randomBytes`, and a mobile client could pass its own.
 */
export function generateCodeVerifier(randomBytes: (size: number) => Uint8Array): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Derives the S256 code_challenge for a code_verifier (RFC 7636 §4.2): the
 * verifier is SHA-256 hashed via the pure core hasher, then base64url encoded.
 */
export function deriveCodeChallenge(codeVerifier: string): string {
  const bytes = new Uint8Array(codeVerifier.length);
  for (let i = 0; i < codeVerifier.length; i += 1) {
    bytes[i] = codeVerifier.charCodeAt(i);
  }
  const hex = sha256Hex(bytes);
  const digest = new Uint8Array(hex.length / 2);
  for (let i = 0; i < digest.length; i += 1) {
    digest[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return toBase64Url(digest);
}