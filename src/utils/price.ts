import { VAT_RATE } from '@/constants/config';
import type { WorkLog } from '@/types';

/**
 * Money helpers.
 *
 * Prices live in the database in two shapes: display strings on catalog rows
 * (`'8,500₮'`) and numeric strings on work logs (`'8500'`). `parsePrice` is the
 * single funnel that turns either into a number, and it behaves exactly like
 * the web version — strip every non-digit, then coerce.
 */

export const parsePrice = (price: string | number | null | undefined): number => {
  if (price === null || price === undefined || price === '') return 0;
  return Number(String(price).replace(/[^0-9]/g, '')) || 0;
};

/** `8500` → `8,500`. */
export const formatNumber = (value: number): string => Math.round(value).toLocaleString();

/** `8500` → `8,500₮`. */
export const formatCurrency = (value: number): string => `${formatNumber(value)}₮`;

/**
 * The amount a work log actually contributes to revenue.
 * VAT-flagged logs bill 10% on top; everything else bills face value.
 */
export const effectivePrice = (log: Pick<WorkLog, 'price' | 'hasVat'>): number => {
  const base = Number(log.price) || 0;
  return log.hasVat ? Math.round(base * (1 + VAT_RATE)) : base;
};

/** The VAT portion alone, for the tax line on the daily report. */
export const vatPortion = (log: Pick<WorkLog, 'price' | 'hasVat'>): number =>
  log.hasVat ? Math.round((Number(log.price) || 0) * VAT_RATE) : 0;

/**
 * Single-letter payment abbreviation used in the Excel exports.
 *
 * Takes a plain `string` rather than `PayType`, because historical rows carry
 * free-text values the union never covered.
 */
export const payTypeAbbr = (payType: string | undefined): string => {
  switch (payType) {
    case 'Бэлэн':
      return 'б';
    case 'Данс':
      return 'д';
    case 'Карт':
      return 'к';
    case 'Холимог':
      return 'х';
    default:
      return payType ?? '';
  }
};

/** Square-metre pricing for banners: `round(width * height * base)`. */
export const calculateAreaPrice = (
  width: number | string,
  height: number | string,
  basePrice: number | string,
): { area: number; total: number } => {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const base = Number(basePrice) || 0;
  const area = w * h;
  return { area, total: Math.round(area * base) };
};

/** Quotation grand total: sum of line items, then 10% VAT on the whole. */
export const quotationBaseTotal = (
  items: readonly { qty: number; unitPrice: string }[],
): number =>
  items.reduce(
    (sum, item) => sum + parsePrice(item.unitPrice) * (Number(item.qty) || 1),
    0,
  );

export const quotationGrandTotal = (
  items: readonly { qty: number; unitPrice: string }[],
): number => Math.round(quotationBaseTotal(items) * (1 + VAT_RATE));
