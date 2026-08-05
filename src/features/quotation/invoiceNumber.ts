/**
 * Invoice numbering.
 *
 * Numbers have to be unique and they have to run in order — an accountant
 * reconciling a month notices a gap or a repeat immediately. Typing them by
 * hand guarantees both eventually, so the app issues them.
 *
 * The format is `YYYY-NNNN`, and the sequence restarts each January. Only the
 * last number actually issued is stored; the next one is derived from it, so
 * there is no counter to drift out of step with the documents.
 */

const PATTERN = /^(\d{4})-(\d+)$/;

/**
 * The number that follows `last`, for a document dated `date`.
 *
 * A blank, malformed, or previous-year `last` starts the year at `0001` rather
 * than continuing a sequence that no longer applies.
 */
export const nextInvoiceNumber = (last: string, date: string): string => {
  const year = /^(\d{4})-/.exec(date)?.[1] ?? String(new Date().getFullYear());
  const match = PATTERN.exec(last.trim());
  const sequence = match !== null && match[1] === year ? Number(match[2]) + 1 : 1;
  return `${year}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Whether `candidate` should replace the stored high-water mark.
 *
 * Numbers are only ever meant to go up. A clerk who overwrites the suggestion
 * with an older number — correcting a document, say — must not drag the
 * sequence backwards and cause the next invoice to reuse a number.
 */
export const isNewerInvoiceNumber = (candidate: string, stored: string): boolean => {
  const next = PATTERN.exec(candidate.trim());
  if (next === null) return false;
  const previous = PATTERN.exec(stored.trim());
  if (previous === null) return true;
  if (next[1] !== previous[1]) return Number(next[1]) > Number(previous[1]);
  return Number(next[2]) > Number(previous[2]);
};
