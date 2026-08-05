import { rtdbClient } from '@/firebase/rtdbClient';
import { logger } from '@/utils/logger';

import { nextInvoiceNumber } from './invoiceNumber';

/**
 * Shared invoice numbering across devices.
 *
 * A counter held on each phone gives two phones the same number — the shop runs
 * an Admin device and an iPad, and both issue invoices. So the number is
 * claimed in the database instead: one node per number under `/pmn/invoices`,
 * named after the number itself.
 *
 * There is no transaction available over the REST API, so claiming is
 * write-then-read-back. Firebase resolves concurrent writes to the same path as
 * last-writer-wins, and both devices then read the same winner — the loser sees
 * someone else's device id and moves on to the next number. Two phones tapping
 * export in the same second cost one extra round trip, not a duplicate number.
 *
 * Offline is the honest gap: a device with no connection issues from its local
 * counter, and two devices offline at once can still collide. Recording the
 * claim when the queue drains would not help, since the document is already
 * printed by then.
 */

export interface InvoiceClaim {
  number: string;
  deviceId: string;
  at: number;
  customer: string;
}

/** How many numbers to walk past before giving up on a contested claim. */
const MAX_ATTEMPTS = 5;

const isClaim = (raw: unknown): raw is InvoiceClaim =>
  typeof raw === 'object' &&
  raw !== null &&
  typeof (raw as { deviceId?: unknown }).deviceId === 'string';

/**
 * The highest number already issued for `year`, or `''` if there are none.
 *
 * Reads the node keys rather than their contents: the key *is* the number, so
 * a half-written claim still counts as taken. The sequence is compared as a
 * number, not as text — string order puts `2026-9999` above `2026-10000` and
 * would hand out ten thousand a second time.
 */
export const highestIssued = (remote: unknown, year: string): string => {
  if (typeof remote !== 'object' || remote === null) return '';
  const prefix = `${year}-`;
  let highest = '';
  let highestSequence = -1;

  for (const key of Object.keys(remote)) {
    if (!key.startsWith(prefix)) continue;
    const tail = key.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;
    const sequence = Number(tail);
    if (sequence > highestSequence) {
      highestSequence = sequence;
      highest = key;
    }
  }
  return highest;
};

const yearOf = (date: string): string =>
  /^(\d{4})-/.exec(date)?.[1] ?? String(new Date().getFullYear());

/**
 * Reads the next free number without reserving it.
 *
 * Used to fill the field in as soon as the document becomes an invoice, so the
 * clerk sees a plausible number. It is only a suggestion — `claimInvoiceNumber`
 * is what makes it real, and may hand back a different one.
 */
export async function suggestInvoiceNumber(date: string, fallback: string): Promise<string> {
  const result = await rtdbClient.read<Record<string, unknown>>('invoices');
  if (!result.ok) return nextInvoiceNumber(fallback, date);
  return nextInvoiceNumber(highestIssued(result.value, yearOf(date)), date);
}

/**
 * Reserves a number, returning the one actually secured.
 *
 * Falls back to `desired` whenever the database cannot be reached: an invoice
 * that prints with a possibly-duplicate number is a smaller problem than a
 * counter clerk who cannot print at all.
 */
export interface ClaimRequest {
  /** The number shown in the field — the one to try first. */
  desired: string;
  /** The document's date, which decides the year the sequence belongs to. */
  date: string;
  deviceId: string;
  customer: string;
}

export async function claimInvoiceNumber(request: ClaimRequest): Promise<string> {
  const { desired, date, deviceId, customer } = request;
  let candidate = desired;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const claim: InvoiceClaim = { number: candidate, deviceId, at: Date.now(), customer };

    const written = await rtdbClient.writeChild('invoices', candidate, claim);
    if (!written.ok) {
      logger.warn(`Could not reserve invoice ${candidate}; printing it anyway`, written.error);
      return candidate;
    }

    const readBack = await rtdbClient.read<Record<string, unknown>>('invoices');
    if (!readBack.ok) return candidate;

    const stored = (readBack.value ?? {})[candidate];
    if (!isClaim(stored) || stored.deviceId === deviceId) return candidate;

    // Someone else holds it. Take the next free number and try again.
    candidate = nextInvoiceNumber(highestIssued(readBack.value, yearOf(date)), date);
  }

  logger.warn(`Invoice numbering contested ${MAX_ATTEMPTS} times; using ${candidate}`);
  return candidate;
}
