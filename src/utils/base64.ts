/**
 * Base64 → bytes.
 *
 * `expo-file-system`'s `File.write` is declared as `(content, options?)`, but
 * the iOS implementation only accepts one argument and throws
 * `InvalidArgsNumberException` when passed the `{ encoding: 'base64' }` option
 * that Android happily ignores. Writing a `Uint8Array` needs no options at all,
 * so every binary export decodes here first.
 *
 * Written by hand rather than reaching for `atob` or `Buffer`: neither is
 * dependable across Hermes versions, and this is small enough to test.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup table, built once. */
const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function base64ToBytes(base64: string): Uint8Array {
  // Tolerate a data URI (`data:image/jpeg;base64,…`), padding and line breaks.
  const commaIndex = base64.indexOf(',');
  const payload = commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;

  // Collect only real alphabet characters, so `=` padding and whitespace go.
  const codes: number[] = [];
  for (let i = 0; i < payload.length; i += 1) {
    const value = LOOKUP[payload.charCodeAt(i)];
    if (value !== undefined && value !== 255) codes.push(value);
  }

  const bytes = new Uint8Array(Math.floor((codes.length * 3) / 4));
  let out = 0;

  for (let i = 0; i < codes.length; i += 4) {
    const c0 = codes[i] ?? 0;
    const c1 = codes[i + 1] ?? 0;
    const c2 = codes[i + 2];
    const c3 = codes[i + 3];

    bytes[out++] = ((c0 << 2) | (c1 >> 4)) & 0xff;
    if (c2 === undefined) break;
    bytes[out++] = (((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff;
    if (c3 === undefined) break;
    bytes[out++] = (((c2 & 0x03) << 6) | c3) & 0xff;
  }

  return out === bytes.length ? bytes : bytes.subarray(0, out);
}
