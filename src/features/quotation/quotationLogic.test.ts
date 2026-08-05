import { describe, expect, it } from 'vitest';

import type { QuotationForm } from '@/types';

import { emptyQuotationForm, quotationTotals } from './quotationLogic';

const formWith = (over: Partial<QuotationForm>): QuotationForm => ({
  ...emptyQuotationForm(),
  items: [{ id: 1, name: 'Нэрийн хуудас', format: '', material: '', qty: 10, unitPrice: '10000' }],
  ...over,
});

/**
 * These figures go onto a document a customer pays from, so the order of
 * operations matters as much as the arithmetic: the discount comes off before
 * VAT, otherwise the shop charges tax on money nobody hands over.
 */
describe('quotationTotals', () => {
  it('adds 10% on top, exactly as before these fields existed', () => {
    const totals = quotationTotals(formWith({}));
    expect(totals.base).toBe(100000);
    expect(totals.vat).toBe(10000);
    expect(totals.grand).toBe(110000);
  });

  it('charges no VAT when the box is cleared', () => {
    const totals = quotationTotals(formWith({ vatIncluded: false }));
    expect(totals.vat).toBe(0);
    expect(totals.grand).toBe(100000);
  });

  it('takes the discount off before charging VAT', () => {
    const totals = quotationTotals(formWith({ discountPercent: 10 }));
    expect(totals.discount).toBe(10000);
    expect(totals.afterDiscount).toBe(90000);
    expect(totals.vat).toBe(9000);
    expect(totals.grand).toBe(99000);
  });

  it('bills only the advance portion in advance mode', () => {
    const totals = quotationTotals(formWith({ paymentKind: 'advance', advancePercent: 50 }));
    expect(totals.withVat).toBe(110000);
    expect(totals.grand).toBe(55000);
  });

  it('bills what is left after the advance in balance mode', () => {
    const totals = quotationTotals(
      formWith({ paymentKind: 'balance', advancePaid: 55000 }),
    );
    expect(totals.grand).toBe(55000);
  });

  it('never asks for a negative amount when the advance covered everything', () => {
    // Typing one zero too many used to print a refund on an invoice.
    const totals = quotationTotals(formWith({ paymentKind: 'balance', advancePaid: 999999 }));
    expect(totals.grand).toBe(0);
  });

  it('ignores a percentage outside 0–100 rather than inverting the total', () => {
    expect(quotationTotals(formWith({ discountPercent: 250 })).discount).toBe(100000);
    expect(quotationTotals(formWith({ discountPercent: -30 })).discount).toBe(0);
  });

  it('survives fields left blank or unreadable', () => {
    const totals = quotationTotals(
      formWith({
        discountPercent: Number.NaN,
        advancePercent: Number.NaN,
        advancePaid: Number.NaN,
        paymentKind: 'balance',
      }),
    );
    expect(totals.discount).toBe(0);
    expect(totals.grand).toBe(110000);
  });

  it('is zero all the way down for an empty document', () => {
    const totals = quotationTotals(formWith({ items: [] }));
    expect(totals.base).toBe(0);
    expect(totals.grand).toBe(0);
  });
});
