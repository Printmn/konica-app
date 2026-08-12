import type { PayMethodKey, PaySplit, WorkLog } from '@/types';
import { effectivePrice } from '@/utils/price';

/**
 * Jobs settled with more than one method.
 *
 * The counter takes 2,000₮ in cash and puts the remaining 3,000₮ on a card;
 * before this the form could only record one of the two, so the day's cash
 * drawer never reconciled against the report.
 *
 * The three slices are stored as amounts, and the report simply adds each one
 * to its own column. Nothing here re-derives a total from percentages, because
 * the shop rounds to the nearest tögrög by hand and a derived figure would
 * disagree with the till.
 */

export type PayMethod = PayMethodKey;

/** Coerces whatever Firebase handed back into a number. */
const amount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The pay type each slice belongs to, and the label shown beside its field. */
export const PAY_METHODS: readonly { key: PayMethod; label: string }[] = [
  { key: 'cash', label: '💵 Бэлэн' },
  { key: 'card', label: '💳 Карт' },
  { key: 'transfer', label: '🏦 Данс' },
];

export const emptyPaySplit = (): PaySplit => ({ cash: 0, card: 0, transfer: 0 });

/** Sum of the slices, in tögrög. */
export const splitTotal = (split: PaySplit | undefined): number =>
  split ? amount(split.cash) + amount(split.card) + amount(split.transfer) : 0;

/**
 * Whatever the customer still owes on a split job.
 *
 * Negative when the slices overshoot, so the form can say so rather than
 * silently accepting a figure that will not reconcile.
 */
export const splitRemainder = (
  log: Pick<WorkLog, 'price' | 'hasVat' | 'paySplit'>,
): number => effectivePrice(log) - splitTotal(log.paySplit);

/**
 * What this job contributed through one particular method.
 *
 * Single-method jobs answer with their whole effective price under their own
 * method and zero everywhere else, which is exactly what the report did before
 * split payments existed — so old rows keep totalling the same.
 */
export function paidByMethod(
  log: Pick<WorkLog, 'price' | 'hasVat' | 'payType' | 'paySplit'>,
  method: PayMethod,
): number {
  if (log.payType === 'Холимог') {
    return amount(log.paySplit?.[method]);
  }
  const owner: Record<PayMethod, string> = {
    cash: 'Бэлэн',
    card: 'Карт',
    transfer: 'Данс',
  };
  return log.payType === owner[method] ? effectivePrice(log) : 0;
}

/** `2,000₮ бэлэн · 3,000₮ карт` — the card and the exports both show this. */
export function splitSummary(split: PaySplit | undefined): string {
  if (!split) return '';
  const parts: string[] = [];
  for (const { key, label } of PAY_METHODS) {
    const paid = amount(split[key]);
    if (paid > 0) parts.push(`${paid.toLocaleString()}₮ ${label.slice(2).trim()}`);
  }
  return parts.join(' · ');
}

/**
 * Reads a split back off a Firebase record.
 *
 * Returns `undefined` for anything that is not three usable numbers, so a
 * malformed payload degrades to "no split" instead of poisoning the report.
 */
export function readPaySplit(raw: unknown): PaySplit | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const num = (value: unknown): number => Math.max(0, Math.round(amount(value)));
  const split: PaySplit = {
    cash: num(record.cash),
    card: num(record.card),
    transfer: num(record.transfer),
  };
  return splitTotal(split) > 0 ? split : undefined;
}
