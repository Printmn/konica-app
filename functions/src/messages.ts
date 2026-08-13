/**
 * What each alert says.
 *
 * Pure string building, kept apart from the triggers so the wording can be
 * tested — and changed — without touching anything that talks to Firebase.
 */

import type { PushMessage } from './push';

export interface WorkLog {
  id?: number;
  job?: string;
  price?: string | number;
  quantity?: number | string;
  hasVat?: boolean;
  deadline?: string;
  date?: string;
  status?: string;
  customer?: string;
  receivedTime?: string;
  deviceId?: string;
}

export interface ChatMessage {
  sender?: string;
  text?: string;
  image?: string;
  deviceId?: string;
}

export interface InventoryItem {
  id?: number;
  name?: string;
  stock?: string | number;
}

/** `8500` → `8,500`. Matches the app's own formatting. */
export const formatNumber = (value: number): string =>
  Math.round(value).toLocaleString('en-US');

const priceOf = (log: WorkLog): number => {
  const base = Number(log.price) || 0;
  return log.hasVat ? Math.round(base * 1.1) : base;
};

export function newOrderMessage(log: WorkLog): PushMessage {
  const price = log.price ? ` · ${formatNumber(priceOf(log))}₮` : '';
  const who = log.customer ? ` — ${log.customer}` : '';
  const due = log.deadline ? `\n⏳ ${log.deadline}-д өгнө` : '';

  return {
    title: '🆕 Шинэ захиалга',
    body: `${log.job ?? 'Нэргүй ажил'}${price}${who}${due}`,
    channelId: 'orders',
    data: { kind: 'order', id: String(log.id ?? '') },
  };
}

export function chatMessage(message: ChatMessage): PushMessage {
  const text = message.text?.trim();
  return {
    title: `💬 ${message.sender || 'Ажилтан'}`,
    body: text && text.length > 0 ? text : '📷 Зураг илгээлээ',
    channelId: 'chat',
    data: { kind: 'chat' },
  };
}

export const LOW_STOCK_THRESHOLD = 5;

/** Stock is stored as free text on old rows: `'12'`, `'12 ш'`, `''`. */
export const stockCount = (item: InventoryItem): number =>
  Number(String(item.stock ?? '').replace(/[^0-9]/g, '')) || 0;

/**
 * Whether an item just crossed the line.
 *
 * The trigger fires on every write, and «дуусаж байна» once a minute for the
 * same box of paper is worse than no alert at all. So the message is only
 * produced on the edge — the write that took it from above the threshold to at
 * or below it.
 */
export function lowStockMessage(
  before: InventoryItem | null,
  after: InventoryItem | null,
): PushMessage | null {
  if (after === null) return null;

  const now = stockCount(after);
  if (now > LOW_STOCK_THRESHOLD) return null;

  const previously = before === null ? Number.POSITIVE_INFINITY : stockCount(before);
  if (previously <= LOW_STOCK_THRESHOLD) return null;

  const name = after.name ?? 'Бараа';
  return {
    title: now === 0 ? '🚫 Бараа дууслаа' : '⚠️ Үлдэгдэл дуусч байна',
    body: now === 0 ? `${name} — үлдэгдэлгүй` : `${name} — ${now} ширхэг үлдлээ`,
    channelId: 'stock',
    data: { kind: 'stock', id: String(after.id ?? '') },
  };
}

/** Minutes since midnight for an `HH:mm` string; -1 when unreadable. */
export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (match === null) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return -1;
  return hours * 60 + minutes;
}

const FINISHED = new Set(['Болсон', 'Болсон аваагүй']);

/**
 * Jobs due within the next `window` minutes and not yet finished.
 *
 * Only today's jobs, and only ones that have not gone past their time: a job
 * that was due an hour ago is late, and being told about it every five minutes
 * for the rest of the day helps nobody.
 */
export function dueSoon(
  logs: Record<string, WorkLog> | null,
  options: { today: string; nowMinutes: number; window?: number },
): WorkLog[] {
  if (logs === null) return [];
  const { today, nowMinutes, window = 30 } = options;

  return Object.values(logs).filter((log) => {
    if (log.date !== today) return false;
    if (FINISHED.has(log.status ?? '')) return false;
    const due = timeToMinutes(log.deadline ?? '');
    if (due < 0) return false;
    return due >= nowMinutes && due <= nowMinutes + window;
  });
}

export function dueSoonMessage(logs: readonly WorkLog[]): PushMessage | null {
  if (logs.length === 0) return null;

  const first = logs[0];
  if (logs.length === 1 && first) {
    return {
      title: '⏳ Хугацаа дөхөж байна',
      body: `${first.job ?? 'Ажил'} — ${first.deadline}-д өгнө`,
      channelId: 'deadline',
      data: { kind: 'deadline' },
    };
  }

  const names = logs
    .slice(0, 3)
    .map((log) => log.job ?? 'Ажил')
    .join(', ');
  const more = logs.length > 3 ? ` +${logs.length - 3}` : '';

  return {
    title: `⏳ ${logs.length} ажлын хугацаа дөхөж байна`,
    body: `${names}${more}`,
    channelId: 'deadline',
    data: { kind: 'deadline' },
  };
}
