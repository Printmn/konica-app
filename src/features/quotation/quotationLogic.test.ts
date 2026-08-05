import { describe, expect, it } from 'vitest';

import type { QuotationForm } from '@/types';

import {
  copyForReceipt,
  emptyDocumentDrafts,
  emptyQuotationForm,
  isBlankDocument,
  quotationTotals,
} from './quotationLogic';

const formWith = (over: Partial<QuotationForm>): QuotationForm => ({
  ...emptyQuotationForm(),
  items: [{ id: 1, name: 'Нэрийн хуудас', format: '', material: '', qty: 10, unitPrice: '10000' }],
  ...over,
});

/**
 * An invoice is a demand for payment and has to carry a stamp, a signature and
 * the amount in words to be accepted; a quotation is an offer and carries none
 * of that. Making the clerk flip four switches on every invoice is how one of
 * them eventually goes out unsigned.
 */
describe('defaults by document type', () => {
  it('gives an invoice its stamp, signature and written amount', () => {
    const invoice = emptyQuotationForm('invoice');
    expect(invoice.showStamp).toBe(true);
    expect(invoice.showSignature).toBe(true);
    expect(invoice.showAmountInWords).toBe(true);
  });

  it('leaves a quotation exactly as it printed before these fields existed', () => {
    const quotation = emptyQuotationForm();
    expect(quotation.showStamp).toBe(false);
    expect(quotation.showSignature).toBe(false);
    expect(quotation.showAmountInWords).toBe(false);
    expect(quotation.discountPercent).toBe(0);
    expect(quotation.paymentKind).toBe('full');
  });

  it('stamps a receipt like an invoice — it is the invoice’s counterpart', () => {
    expect(emptyQuotationForm('receipt').showStamp).toBe(true);
    expect(emptyQuotationForm('receipt').showSignature).toBe(true);
  });
});

describe('emptyDocumentDrafts', () => {
  it('gives each document type its own draft', () => {
    const drafts = emptyDocumentDrafts();
    expect(drafts.quotation).not.toBe(drafts.invoice);
    expect(drafts.invoice).not.toBe(drafts.receipt);
  });

  it('does not share the items array between drafts', () => {
    // Sharing it would make a line typed on the quotation appear on the
    // invoice, which is exactly the bug separate drafts exist to prevent.
    const drafts = emptyDocumentDrafts();
    expect(drafts.quotation.items).not.toBe(drafts.invoice.items);
  });

  it('carries the per-type defaults through', () => {
    expect(emptyDocumentDrafts().invoice.showStamp).toBe(true);
    expect(emptyDocumentDrafts().quotation.showStamp).toBe(false);
  });
});

/**
 * An invoice and its receipt describe one sale and are filed together under a
 * single number. Retyping the customer and every line onto the second one is
 * only a chance to get them different.
 */
describe('starting a receipt from its invoice', () => {
  const invoice = {
    ...emptyQuotationForm('invoice'),
    customer: 'Тэст ХХК',
    phone: '99000099',
    docNumber: '2026-0007',
    discountPercent: 5,
    items: [
      { id: 1, name: 'Нэрийн хуудас', format: '', material: '', qty: 500, unitPrice: '850' },
    ],
  };

  it('carries the customer, the lines and the number across', () => {
    const receipt = copyForReceipt(invoice);
    expect(receipt.customer).toBe('Тэст ХХК');
    expect(receipt.items[0]?.name).toBe('Нэрийн хуудас');
    expect(receipt.discountPercent).toBe(5);
    // The shared number is what ties the pair together in the ledger.
    expect(receipt.docNumber).toBe('2026-0007');
  });

  it('does not share the line rows, so editing one cannot change the other', () => {
    const receipt = copyForReceipt(invoice);
    expect(receipt.items[0]).not.toBe(invoice.items[0]);
    expect(receipt.items).not.toBe(invoice.items);
  });

  it('is dated the day the goods went out, not the day of the invoice', () => {
    expect(copyForReceipt({ ...invoice, date: '2026-08-01' }).date).not.toBe('2026-08-01');
  });
});

describe('isBlankDocument', () => {
  it('is true for an untouched draft', () => {
    expect(isBlankDocument(emptyQuotationForm('receipt'))).toBe(true);
  });

  it('is false once a customer has been named', () => {
    expect(isBlankDocument({ ...emptyQuotationForm(), customer: 'А' })).toBe(false);
  });

  it('is false once a line has been entered, even with no customer', () => {
    // Clerks often type the items first; treating that as blank would wipe it.
    const withItem = {
      ...emptyQuotationForm(),
      items: [{ id: 1, name: 'Хавтас', format: '', material: '', qty: 1, unitPrice: '' }],
    };
    expect(isBlankDocument(withItem)).toBe(false);
  });

  it('is false once a price has been entered without a name', () => {
    const priced = {
      ...emptyQuotationForm(),
      items: [{ id: 1, name: '', format: '', material: '', qty: 1, unitPrice: '5000' }],
    };
    expect(isBlankDocument(priced)).toBe(false);
  });
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
