import { describe, expect, it } from 'vitest';

import {
  calculateAreaPrice,
  effectivePrice,
  formatCurrency,
  parsePrice,
  payTypeAbbr,
  quotationBaseTotal,
  quotationGrandTotal,
  vatPortion,
} from './price';

describe('parsePrice', () => {
  it('reads both shapes the database stores', () => {
    expect(parsePrice('8500')).toBe(8500);
    expect(parsePrice('8,500₮')).toBe(8500);
    expect(parsePrice(8500)).toBe(8500);
  });

  it('is zero for anything unusable rather than NaN', () => {
    expect(parsePrice('')).toBe(0);
    expect(parsePrice(null)).toBe(0);
    expect(parsePrice(undefined)).toBe(0);
    expect(parsePrice('тохиролцоно')).toBe(0);
  });

  it('drops a decimal point along with the other punctuation', () => {
    // Documents existing behaviour: the shop never prices in fractions of a
    // tögrög, and the web build stripped every non-digit the same way.
    expect(parsePrice('8500.50')).toBe(850050);
  });
});

describe('VAT', () => {
  it('bills 10% on top of a flagged log', () => {
    expect(effectivePrice({ price: '10000', hasVat: true })).toBe(11000);
    expect(vatPortion({ price: '10000', hasVat: true })).toBe(1000);
  });

  it('leaves an unflagged log at face value', () => {
    expect(effectivePrice({ price: '10000', hasVat: false })).toBe(10000);
    expect(vatPortion({ price: '10000', hasVat: false })).toBe(0);
  });

  it('rounds rather than leaving fractional tögrög', () => {
    expect(effectivePrice({ price: '8505', hasVat: true })).toBe(9356);
    expect(vatPortion({ price: '8505', hasVat: true })).toBe(851);
  });
});

describe('formatCurrency', () => {
  it('groups thousands and appends the symbol', () => {
    expect(formatCurrency(8500)).toBe('8,500₮');
    expect(formatCurrency(0)).toBe('0₮');
  });
});

describe('payTypeAbbr', () => {
  it('maps the three known types', () => {
    expect(payTypeAbbr('Бэлэн')).toBe('б');
    expect(payTypeAbbr('Данс')).toBe('д');
    expect(payTypeAbbr('Карт')).toBe('к');
  });

  it('passes anything else through unchanged', () => {
    expect(payTypeAbbr('Бусад')).toBe('Бусад');
    expect(payTypeAbbr(undefined)).toBe('');
  });
});

describe('calculateAreaPrice', () => {
  it('multiplies the two edges by the base rate', () => {
    expect(calculateAreaPrice(2, 1.5, 20000)).toEqual({ area: 3, total: 60000 });
  });

  it('accepts the string values the form supplies', () => {
    expect(calculateAreaPrice('2', '0.5', '18000')).toEqual({ area: 1, total: 18000 });
  });

  it('is zero when a dimension is missing', () => {
    expect(calculateAreaPrice('', 2, 20000)).toEqual({ area: 0, total: 0 });
  });
});

describe('quotation totals', () => {
  const items = [
    { qty: 2, unitPrice: '5,000₮' },
    { qty: 1, unitPrice: '12000' },
  ];

  it('sums line items before tax', () => {
    expect(quotationBaseTotal(items)).toBe(22000);
  });

  it('applies VAT to the whole quotation, not per line', () => {
    expect(quotationGrandTotal(items)).toBe(24200);
  });

  it('treats a missing quantity as one', () => {
    expect(quotationBaseTotal([{ qty: 0, unitPrice: '5000' }])).toBe(5000);
  });
});
