/**
 * Minimal UTF-8 encode/decode, pure and dependency-free so core works in any
 * runtime (Electron main, React Native, tests) without global TextEncoder.
 * The sync manifest is stored as UTF-8 bytes on the cloud drive.
 */

/** Encodes a string to UTF-8 bytes. */
export function utf8Encode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    let code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** Decodes UTF-8 bytes to a string, replacing invalid sequences with U+FFFD. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if (b0 >= 0xc2 && b0 <= 0xdf && i + 1 < bytes.length) {
      const b1 = bytes[i + 1];
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
    } else if (
      (b0 === 0xe0 && i + 2 < bytes.length) ||
      (b0 >= 0xe1 && b0 <= 0xef && i + 2 < bytes.length)
    ) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
    } else if (b0 >= 0xf0 && b0 <= 0xf4 && i + 3 < bytes.length) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      const code =
        0x10000 + ((b0 & 0x07) << 18) + ((b1 & 0x3f) << 12) + ((b2 & 0x3f) << 6) + (b3 & 0x3f);
      out += String.fromCharCode(0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff));
      i += 4;
    } else {
      out += '\ufffd';
      i += 1;
    }
  }
  return out;
}
