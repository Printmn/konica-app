import type {
  DocType,
  PaymentKind,
  QuotationForm,
  QuotationItem,
  QuotationPrefill,
} from '@/types';
import { todayString } from '@/utils/date';
import { parsePrice, quotationBaseTotal, quotationGrandTotal } from '@/utils/price';
import { nextId } from '@/utils/id';

/**
 * Quotation / invoice / receipt document state.
 *
 * All three document types share one form; only the heading changes. Totals
 * always add 10% VAT on the sum of line items, matching the original
 * `getTotal = Math.round(getBaseTotal() * 1.1)`.
 */

export const READY_TIME_OPTIONS = [
  '1 хоног',
  '2-3 хоног',
  '3-5 хоног',
  '7+ хоног',
  '2 долоо хоног',
] as const;

export const docTypeLabel = (docType: DocType): string => {
  switch (docType) {
    case 'invoice':
      return 'НЭХЭМЖЛЭХ';
    case 'receipt':
      return 'ЗАРЛАГЫН БАРИМТ';
    default:
      return 'ҮНИЙН САНАЛ';
  }
};

export const emptyQuotationItem = (id: number): QuotationItem => ({
  id,
  name: '',
  format: '',
  material: '',
  qty: 1,
  unitPrice: '',
});

/**
 * A blank document.
 *
 * The three types are not variations on one form in practice: a quotation is a
 * price someone is being offered, an invoice is a demand for payment that has
 * to carry a stamp, a signature and the amount in words to be accepted. So the
 * defaults differ by type rather than making the clerk switch four toggles on
 * every invoice.
 *
 * A quotation still prints exactly what it printed before these fields
 * existed — every extra starts neutral there.
 */
export const emptyQuotationForm = (docType: DocType = 'quotation'): QuotationForm => {
  // A receipt is the invoice's counterpart and is stamped and signed the same
  // way; only a quotation goes out plain.
  const isInvoice = docType === 'invoice' || docType === 'receipt';
  return {
    customer: '',
    phone: '',
    date: todayString(),
    readyTime: '2-3 хоног',
    vatIncluded: true,
    showTotal: true,
    items: [emptyQuotationItem(1)],
    docNumber: '',
    dueDate: '',
    discountPercent: 0,
    paymentKind: 'full',
    advancePercent: 50,
    advancePaid: 0,
    showSignature: isInvoice,
    showStamp: isInvoice,
    showAmountInWords: isInvoice,
  };
};

/** One independent draft per document type. */
export type DocumentDrafts = Record<DocType, QuotationForm>;

/**
 * Three separate drafts, so switching tabs does not carry a quotation's
 * customer, items and terms onto an invoice — they are different documents
 * for different moments, and the shop often has both open for one job.
 */
export const emptyDocumentDrafts = (): DocumentDrafts => ({
  quotation: emptyQuotationForm('quotation'),
  invoice: emptyQuotationForm('invoice'),
  receipt: emptyQuotationForm('receipt'),
});

/**
 * Whether nothing has been entered on this document yet.
 *
 * Used to decide when it is safe to copy another draft over this one. A blank
 * customer is not enough on its own — a clerk may have typed the items first —
 * so every field a person could have filled in is checked.
 */
export const isBlankDocument = (form: QuotationForm): boolean =>
  form.customer.trim() === '' &&
  form.phone.trim() === '' &&
  form.items.every((item) => item.name.trim() === '' && item.unitPrice.trim() === '');

/**
 * A receipt for an invoice.
 *
 * The two are filed together and describe the same sale, so the receipt starts
 * as a copy: same customer, same lines, same amounts, and the *same number* —
 * that shared number is what ties the pair together in the ledger.
 *
 * It is a copy rather than a live link. Once made, the receipt is edited on its
 * own: the shop sometimes hands over part of an order, and the paper that goes
 * with the goods has to say what actually went out.
 */
export const copyForReceipt = (invoice: QuotationForm): QuotationForm => ({
  ...invoice,
  // Fresh identity for the line rows so editing one document cannot reach into
  // the other through a shared object.
  items: invoice.items.map((item) => ({ ...item })),
  date: todayString(),
});

export const addItem = (form: QuotationForm): QuotationForm => ({
  ...form,
  // Two quick taps in one millisecond used to give both rows the same id,
  // after which editing or deleting one silently did the same to the other.
  items: [...form.items, emptyQuotationItem(nextId())],
});

export const removeItem = (form: QuotationForm, id: number): QuotationForm => ({
  ...form,
  items: form.items.filter((item) => item.id !== id),
});

export const updateItem = <K extends keyof QuotationItem>(
  form: QuotationForm,
  id: number,
  field: K,
  value: QuotationItem[K],
): QuotationForm => ({
  ...form,
  items: form.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
});

export const baseTotal = (form: QuotationForm): number => quotationBaseTotal(form.items);
export const grandTotal = (form: QuotationForm): number => quotationGrandTotal(form.items);

export const lineTotal = (item: QuotationItem): number =>
  parsePrice(item.unitPrice) * (Number(item.qty) || 1);

export const paymentKindLabel = (kind: PaymentKind): string => {
  switch (kind) {
    case 'advance':
      return 'Урьдчилгаа';
    case 'balance':
      return 'Үлдэгдэл';
    default:
      return 'Бүтэн';
  }
};

/** Every figure that appears in the totals block, in the order it is printed. */
export interface QuotationTotals {
  /** Sum of the line items, before anything is taken off or added. */
  base: number;
  discount: number;
  /** Line total less the discount — what VAT is charged on. */
  afterDiscount: number;
  /** 10% on top, as the shop has always calculated it. Zero when VAT is off. */
  vat: number;
  /** After discount plus VAT: the full value of the job. */
  withVat: number;
  /** The advance portion, when billing an advance. */
  advance: number;
  /** The advance already received, when billing a balance. */
  advancePaid: number;
  /** What this particular document asks the customer to pay. */
  grand: number;
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

/**
 * Works the document's figures out in one place.
 *
 * VAT is added on top at 10%, unchanged from the original web build — it is
 * not separated out of the price. Discount comes off first, so VAT is charged
 * on the discounted amount rather than on a sum nobody is paying.
 */
export const quotationTotals = (form: QuotationForm): QuotationTotals => {
  const base = quotationBaseTotal(form.items);
  const discount = Math.round((base * clampPercent(form.discountPercent)) / 100);
  const afterDiscount = base - discount;
  const vat = form.vatIncluded ? Math.round(afterDiscount * 0.1) : 0;
  const withVat = afterDiscount + vat;

  const advance = Math.round((withVat * clampPercent(form.advancePercent)) / 100);
  // A paid advance larger than the job would print a negative amount due, so
  // it is capped: the customer owes nothing rather than being owed money.
  const advancePaid = Math.min(
    withVat,
    Math.max(0, Number.isFinite(form.advancePaid) ? Math.round(form.advancePaid) : 0),
  );

  let grand = withVat;
  if (form.paymentKind === 'advance') grand = advance;
  else if (form.paymentKind === 'balance') grand = withVat - advancePaid;

  return { base, discount, afterDiscount, vat, withVat, advance, advancePaid, grand };
};

/** Merges a prefill (from a work log or an order) into the current form. */
export const applyPrefill = (
  form: QuotationForm,
  prefill: QuotationPrefill,
): QuotationForm => ({
  ...form,
  customer: prefill.customer || form.customer,
  vatIncluded: prefill.vatIncluded !== undefined ? prefill.vatIncluded : form.vatIncluded,
  items: prefill.items
    ? prefill.items.map((item, index) => ({
        id: index + 1,
        name: item.name || '',
        format: '',
        material: '',
        qty: item.qty || 1,
        unitPrice: item.unitPrice || '',
      }))
    : form.items,
});

export const validateQuotation = (form: QuotationForm): string | null => {
  if (form.items.length === 0) return 'Дор хаяж нэг мөр нэмнэ үү.';
  if (form.items.every((item) => !item.name.trim())) return 'Барааны нэрийг оруулна уу.';
  return null;
};
