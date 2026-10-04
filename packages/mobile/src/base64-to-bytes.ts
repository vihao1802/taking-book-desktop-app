/**
 * Decodes base64 text, the form Capacitor plugins use for binary data.
 *
 * @param base64 The base64 text; empty text gives no bytes.
 * @returns The decoded bytes.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
