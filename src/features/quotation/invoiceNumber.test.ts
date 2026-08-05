import { describe, expect, it } from 'vitest';

import { isNewerInvoiceNumber, nextInvoiceNumber } from './invoiceNumber';

/**
 * A repeated invoice number is not a cosmetic problem: two different documents
 * claim the same identity, and the month will not reconcile.
 */
describe('nextInvoiceNumber', () => {
  it('starts a fresh year at 0001', () => {
    expect(nextInvoiceNumber('', '2026-08-04')).toBe('2026-0001');
  });

  it('continues the sequence', () => {
    expect(nextInvoiceNumber('2026-0007', '2026-08-04')).toBe('2026-0008');
  });

  it('carries past four digits rather than wrapping', () => {
    expect(nextInvoiceNumber('2026-9999', '2026-08-04')).toBe('2026-10000');
  });

  it('restarts in January rather than continuing last year', () => {
    expect(nextInvoiceNumber('2026-0142', '2027-01-03')).toBe('2027-0001');
  });

  it('ignores a number that was typed in some other shape', () => {
    expect(nextInvoiceNumber('НХ-14', '2026-08-04')).toBe('2026-0001');
  });

  it('falls back to the current year when the date is unreadable', () => {
    const year = String(new Date().getFullYear());
    expect(nextInvoiceNumber('', 'өнөөдөр')).toBe(`${year}-0001`);
  });
});

describe('isNewerInvoiceNumber', () => {
  it('accepts the next number in sequence', () => {
    expect(isNewerInvoiceNumber('2026-0008', '2026-0007')).toBe(true);
  });

  it('refuses to move the sequence backwards', () => {
    // Correcting an old document must not make the next one reuse a number.
    expect(isNewerInvoiceNumber('2026-0003', '2026-0007')).toBe(false);
  });

  it('refuses the same number twice', () => {
    expect(isNewerInvoiceNumber('2026-0007', '2026-0007')).toBe(false);
  });

  it('accepts a new year', () => {
    expect(isNewerInvoiceNumber('2027-0001', '2026-0142')).toBe(true);
  });

  it('refuses a previous year', () => {
    expect(isNewerInvoiceNumber('2025-9999', '2026-0001')).toBe(false);
  });

  it('accepts anything once nothing has been issued', () => {
    expect(isNewerInvoiceNumber('2026-0001', '')).toBe(true);
  });

  it('does not record a hand-typed number it cannot parse', () => {
    expect(isNewerInvoiceNumber('НХ-14', '2026-0007')).toBe(false);
  });
});
