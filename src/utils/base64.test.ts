import { describe, expect, it } from 'vitest';

import { base64ToBytes } from './base64';

/** Node's own decoder, used as the reference implementation. */
const reference = (base64: string): Uint8Array =>
  new Uint8Array(Buffer.from(base64, 'base64'));

describe('base64ToBytes', () => {
  it('decodes with no padding', () => {
    expect(base64ToBytes('YWJj')).toEqual(new Uint8Array([97, 98, 99]));
  });

  it('decodes one padding character', () => {
    expect(base64ToBytes('YWJjZA==')).toEqual(reference('YWJjZA=='));
  });

  it('decodes two padding characters', () => {
    expect(base64ToBytes('YWJjZGU=')).toEqual(reference('YWJjZGU='));
  });

  it('is empty for empty input', () => {
    expect(base64ToBytes('')).toEqual(new Uint8Array([]));
  });

  it('handles the full byte range, including the high bit', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    const encoded = Buffer.from(bytes).toString('base64');
    expect(base64ToBytes(encoded)).toEqual(bytes);
  });

  it('matches Node byte for byte across many random payloads', () => {
    for (let length = 1; length <= 64; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      const encoded = Buffer.from(bytes).toString('base64');
      expect(base64ToBytes(encoded)).toEqual(bytes);
    }
  });

  it('survives the line breaks some encoders insert', () => {
    const bytes = new Uint8Array(120).fill(7);
    const encoded = Buffer.from(bytes).toString('base64');
    const wrapped = encoded.replace(/(.{16})/g, '$1\n');
    expect(base64ToBytes(wrapped)).toEqual(bytes);
  });

  it('strips a data URI prefix, as sent by the image picker', () => {
    expect(base64ToBytes('data:image/jpeg;base64,YWJj')).toEqual(
      new Uint8Array([97, 98, 99]),
    );
  });

  it('decodes a real XLSX header — the case that broke on iOS', () => {
    // A .xlsx is a ZIP: the first bytes must be PK\x03\x04 or Excel refuses it.
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const encoded = Buffer.from(zipHeader).toString('base64');
    expect(base64ToBytes(encoded)).toEqual(zipHeader);
  });
});
