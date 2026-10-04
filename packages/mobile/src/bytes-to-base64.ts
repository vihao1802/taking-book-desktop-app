// Small enough that String.fromCharCode never exceeds the engine's argument limit.
const SLICE_BYTES = 0x8000;

/**
 * Encodes bytes as base64, the form the Capacitor Filesystem plugin accepts for
 * binary data. Done in slices so a megabyte block does not overflow the call stack.
 *
 * @param bytes The bytes to encode.
 * @returns The base64 text.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.byteLength; start += SLICE_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + SLICE_BYTES));
  }
  return btoa(binary);
}
