import type { InventoryItem, StockUsage } from '@/types';
import { shiftDate, toDateString, todayString } from '@/utils/date';
import { nextId } from '@/utils/id';

import { stockCount } from './inventoryLogic';

/**
 * What the shop got through today.
 *
 * The counter records «A4 цаас — 250ш» and two things happen at once: the day
 * gets a line in the usage log, and the item's stock comes down by the same
 * number. Keeping both is the point — the log answers "how fast do we go
 * through paper", the stock answers "do we have any", and a figure that only
 * did one of those would be quietly wrong for the other question.
 *
 * Reversing an entry has to put the stock back, which is why removal is a
 * function here rather than an array filter at the call site.
 */

export interface NewUsage {
  itemId: number;
  itemName: string;
  /** Whole sheets, as typed. */
  quantity: string;
  note: string;
  by: string;
  date?: string;
  /** Set when the draw was booked by an order rather than typed by hand. */
  logId?: number;
}

/** `'250'`, `'250ш'`, `'2 500'` — the counter types all three. */
export const parseQuantity = (raw: string): number =>
  Number(String(raw).replace(/[^0-9]/g, '')) || 0;

export function validateUsage(draft: NewUsage): string | null {
  if (draft.itemId <= 0) return 'Бараагаа сонгоно уу.';
  if (parseQuantity(draft.quantity) <= 0) return 'Ширхэгээ оруулна уу.';
  return null;
}

export function createUsage(draft: NewUsage, now: Date = new Date()): StockUsage {
  return {
    id: nextId(),
    date: draft.date || toDateString(now),
    itemId: draft.itemId,
    itemName: draft.itemName,
    quantity: parseQuantity(draft.quantity),
    note: draft.note.trim(),
    by: draft.by,
    at: now.getTime(),
    // Omitted rather than set to undefined: the write queue sends the object
    // as-is and Firebase rejects an undefined value outright.
    ...(draft.logId === undefined ? {} : { logId: draft.logId }),
  };
}

/**
 * Takes the used sheets off the shelf.
 *
 * Stock is a string in the database and always has been — `'22'`, `''`, once
 * `'5-10'` — so it is read through `stockCount` and written back as a plain
 * number. It is allowed to go negative: a shelf that says −30 is a counting
 * mistake somebody has to reconcile, and silently clamping it to zero hides
 * exactly the error worth seeing.
 */
export const applyUsage = (
  inventory: readonly InventoryItem[],
  itemId: number,
  used: number,
): InventoryItem[] =>
  inventory.map((item) =>
    item.id === itemId ? { ...item, stock: String(stockCount(item) - used) } : item,
  );

/**
 * The papers the counter actually draws on, in a fixed order.
 *
 * The screen used to search the whole catalogue, which is right for a shop that
 * consumes fifty things and wrong for one that consumes two: every entry began
 * with typing the name of an item that was always going to be one of a handful.
 *
 * Matched on the name rather than the «Цаас» category, because that category
 * also holds A3 writing paper and sticker stock — neither of which is counted
 * this way. Both alphabets' «A» are accepted: the catalogue writes Cyrillic
 * А4 (U+0410), but a hand-typed item is as likely to carry the Latin one, and
 * the two are indistinguishable on screen.
 */
const PAPER_NAME = /^(бичгийн\s+цаас\s+[аa]4|фото)/iu;

/**
 * Reading order, not catalogue order.
 *
 * Writing paper leads because it is the one drawn on most days. The two
 * hand-cut photo sizes follow it, because they are what somebody reaches for
 * next and burying them below six A4 variants is what made them hard to find.
 * Anything not named here keeps its catalogue position, after these.
 */
const PAPER_ORDER: readonly RegExp[] = [
  /^бичгийн\s+цаас\s+[аa]4/iu,
  /^фото\s+цаас\s+10\s*[xх]\s*15/iu,
  /^фото\s+цаас\s+16\s*[xх]\s*22/iu,
];

const paperRank = (name: string): number => {
  const at = PAPER_ORDER.findIndex((pattern) => pattern.test(name.trim()));
  return at === -1 ? PAPER_ORDER.length : at;
};

export const paperStock = (inventory: readonly InventoryItem[]): InventoryItem[] =>
  inventory
    .filter((item) => PAPER_NAME.test((item.name || '').trim()))
    .sort((a, b) => paperRank(a.name) - paperRank(b.name));

// ──────────────── Paper that goes out through an order ────────────────

/**
 * Comparable form of a product name.
 *
 * Case folded, punctuation and the `(2 талтай)` kind of parenthetical dropped,
 * spacing collapsed — «Фото цаас А4 200гр (2 талтай)» and «фото цаас a4 200гр»
 * are the same paper, and the catalogue and the order form do not agree on
 * which one to write. Latin and Cyrillic «а», «о», «с», «е», «р», «х» are
 * folded together for the same reason they are in `PAPER_NAME`: on screen they
 * are the same letters, and both get typed.
 */
const CONFUSABLE: Record<string, string> = {
  a: 'а', o: 'о', c: 'с', e: 'е', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', b: 'в', h: 'н',
};

export const normalizeProduct = (name: string): string =>
  (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/[aocepxykmtbh]/gu, (ch) => CONFUSABLE[ch] ?? ch)
    .trim()
    .replace(/\s+/gu, ' ');

/**
 * The paper an order draws off the shelf, if any.
 *
 * Matched by name: an order for «Бичгийн цаас А4 (10ш)» is ten sheets of
 * «Бичгийн цаас А4», and nothing else in the catalogue is. Printing services
 * — «Бичиг баримт канон», «Хэвлэл: Фото цаас А4» — consume paper too, but
 * *which* paper and how many sheets per copy is a mapping the shop has never
 * written down, and guessing it would take stock off a shelf nobody chose.
 * Those stay manual until somebody says what the rule is.
 *
 * Returns `null` rather than throwing on no match: most orders are not paper.
 */
export interface PaperDraw {
  item: InventoryItem;
  sheets: number;
}

/** Trailing `(10ш)`, as quick orders write it. */
const COUNT_TAIL = /\(\s*(\d+)\s*ш\s*\)\s*$/u;

/**
 * A job that is about paper or printing at all.
 *
 * «Улаан хавтас А4» and «Жааз 60х40» name a size and consume none of the
 * shop's paper; without this they matched on the size alone and quietly took
 * sheets off the wrong shelf. Checked only on the size pass — the two name
 * passes already identify the paper exactly.
 */
const ABOUT_PAPER = /цаас|хэвл|угаа|фото|принт/iu;

/**
 * The paper size a name mentions, in one canonical spelling.
 *
 * «10*15», «10x15», «10х15» (Cyrillic х), «10 × 15» are all the same size and
 * all four get typed. Sheet formats are read too, so «А4» and «A4» agree.
 * `null` when the name names no size at all — «Бичиг баримт канон».
 */
const DIMENSIONS = /(\d{1,3})\s*[x×х*]\s*(\d{1,3})/iu;
const SHEET_FORMAT = /(?:^|[^\p{L}\p{N}])[аa]\s?([2-6])(?![\p{L}\p{N}])/iu;

export function paperSize(name: string): string | null {
  const pair = DIMENSIONS.exec(name || '');
  if (pair?.[1] !== undefined && pair[2] !== undefined) {
    // Sorted so «15x10» and «10x15» are one size — the counter writes both.
    const [small, large] = [Number(pair[1]), Number(pair[2])].sort((a, b) => a - b);
    return `${small}x${large}`;
  }
  const sheet = SHEET_FORMAT.exec(name || '');
  return sheet?.[1] === undefined ? null : `a${sheet[1]}`;
}

/**
 * The paper an order draws, first by name and then by size.
 *
 * The name match handles «Бичгийн цаас А4 (10ш)» — an order *for* paper. The
 * size match handles the commoner case the first one missed: «Зураг угаалт
 * 10*15 ×100» is a service, named nothing like the stock it consumes, and a
 * hundred sheets of 10x15 came off the shelf all the same.
 *
 * Three passes, narrowest first:
 *
 *  1. the whole job name *is* a paper — «Бичгийн цаас А4 (10ш)»;
 *  2. a paper's name sits inside it — «Хэвлэл: Фото цаас А4 200гр»;
 *  3. the job names a size — «Зураг угаалт 10*15».
 *
 * Only the third can be ambiguous, and it fires only when exactly one paper
 * carries that size. Five different A4 papers sit on this shelf, so a job that
 * says «А4» and nothing more stays manual: taking stock off one of five at
 * random is worse than taking none, because nobody would know which shelf to
 * correct afterwards.
 */
export function paperFor(
  log: Pick<InventoryItem, never> & { job?: string; quantity?: number | string },
  inventory: readonly InventoryItem[],
): PaperDraw | null {
  const job = (log.job ?? '').replace(COUNT_TAIL, '').trim();
  if (job === '') return null;

  const papers = paperStock(inventory);
  const key = normalizeProduct(job);
  if (key === '') return null;

  let item = papers.find((candidate) => normalizeProduct(candidate.name) === key);

  if (item === undefined) {
    // A service that spells the paper out inside a longer name:
    // «Хэвлэл: Фото цаас А4 200гр» is that exact stock with a word in front.
    // Longest match wins, so «Фото цаас А4 200гр» beats «Фото цаас А4» when
    // both are on the shelf — the shorter one is a prefix of the right answer,
    // not a different answer.
    const contained = papers
      .filter((candidate) => {
        const name = normalizeProduct(candidate.name);
        return name !== '' && key.includes(name);
      })
      .sort((a, b) => normalizeProduct(b.name).length - normalizeProduct(a.name).length);
    item = contained[0];
  }

  if (item === undefined) {
    // The size pass needs a guard the other two do not. Half the catalogue
    // carries a sheet format — «Улаан хавтас А4», «Ламинатор А4», «Медаль
    // А4» — and none of them is printed on the shop's paper. So a size only
    // counts when the job also says it is paper or printing.
    if (!ABOUT_PAPER.test(job)) return null;
    const size = paperSize(job);
    if (size === null) return null;
    const bySize = papers.filter((candidate) => paperSize(candidate.name) === size);
    if (bySize.length !== 1) return null;
    item = bySize[0];
  }
  if (item === undefined) return null;

  const stated = Number(log.quantity);
  if (Number.isFinite(stated) && stated > 0) return { item, sheets: stated };

  const named = COUNT_TAIL.exec(log.job ?? '');
  const sheets = named?.[1] === undefined ? 1 : Number(named[1]);
  return { item, sheets };
}

/** The automatic draw booked against one work log, if there is one. */
export const usageForLog = (
  usage: readonly StockUsage[],
  logId: number,
): StockUsage | undefined => usage.find((row) => row.logId === logId);

/**
 * Sets the shelf to a counted figure.
 *
 * The running total drifts: paper gets used without anybody reaching for the
 * app, a ream is opened and half of it goes into a job booked as one sheet, a
 * delivery arrives. So somebody counts what is actually there and types it in,
 * and from that number the deductions start again.
 *
 * Deliberately not a usage entry. A stocktake is not consumption — writing it
 * to the log would make «how fast do we get through paper» include the day
 * somebody found forty sheets behind the printer.
 */
export const setStock = (
  inventory: readonly InventoryItem[],
  itemId: number,
  count: number,
): InventoryItem[] =>
  inventory.map((item) =>
    item.id === itemId ? { ...item, stock: String(Math.max(0, Math.trunc(count))) } : item,
  );

/** Puts stock back — the exact inverse, for undoing a mistyped entry. */
export const revertUsage = (
  inventory: readonly InventoryItem[],
  itemId: number,
  used: number,
): InventoryItem[] => applyUsage(inventory, itemId, -used);

export const newestFirst = (rows: readonly StockUsage[]): StockUsage[] =>
  [...rows].sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1));

export const onDay = (rows: readonly StockUsage[], date: string): StockUsage[] =>
  newestFirst(rows.filter((row) => row.date === date));

export const totalSheets = (rows: readonly StockUsage[]): number =>
  rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

/** Sheets per item over whatever rows are given, heaviest first. */
export function byItem(
  rows: readonly StockUsage[],
): { itemId: number; name: string; quantity: number; times: number }[] {
  const totals = new Map<number, { name: string; quantity: number; times: number }>();
  for (const row of rows) {
    const entry = totals.get(row.itemId) ?? { name: row.itemName, quantity: 0, times: 0 };
    entry.quantity += Number(row.quantity) || 0;
    entry.times += 1;
    // The name is denormalised onto the row, so a renamed item shows whatever
    // it was called most recently rather than losing its history.
    entry.name = row.itemName || entry.name;
    totals.set(row.itemId, entry);
  }
  return [...totals.entries()]
    .map(([itemId, entry]) => ({ itemId, ...entry }))
    .sort((a, b) => b.quantity - a.quantity);
}

/** Everything inside the window the chart drew, newest first. */
export const inWindowRows = (
  rows: readonly StockUsage[],
  bars: readonly { date: string }[],
): StockUsage[] => {
  const days = new Set(bars.map((bar) => bar.date));
  return newestFirst(rows.filter((row) => days.has(row.date)));
};

export interface UsageBar {
  date: string;
  label: string;
  total: number;
  /** 0–1 against the busiest day in the window. */
  height: number;
  isToday: boolean;
}

const WEEKDAYS = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'] as const;

/**
 * The last `days` days as bars, oldest on the left.
 *
 * Scaled against the busiest day rather than a fixed number of sheets: the
 * question is which day was heavy, and a shop that prints 200 sheets one week
 * and 4,000 the next would otherwise get a flat line either way.
 */
export function dailyBars(
  rows: readonly StockUsage[],
  options: { days?: number; today?: string } = {},
): UsageBar[] {
  const { days = 7, today = todayString() } = options;

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.date, (totals.get(row.date) ?? 0) + (Number(row.quantity) || 0));
  }

  const window: { date: string; total: number }[] = [];
  for (let step = days - 1; step >= 0; step -= 1) {
    const date = shiftDate(today, -step);
    window.push({ date, total: totals.get(date) ?? 0 });
  }

  const tallest = Math.max(...window.map((day) => day.total), 0);

  return window.map(({ date, total }) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay();
    return {
      date,
      label: WEEKDAYS[weekday] ?? '',
      total,
      height: tallest > 0 ? total / tallest : 0,
      isToday: date === today,
    };
  });
}

export const windowTotal = (bars: readonly UsageBar[]): number =>
  bars.reduce((sum, bar) => sum + bar.total, 0);

/**
 * Days of stock left at the recent rate.
 *
 * `null` when there is no usage to average — a shelf nobody has drawn from has
 * no meaningful "runs out on Thursday". Deliberately blunt: a mean over the
 * window, not a forecast. Its only job is to turn "40 left" into "about four
 * days", which is the form the question is actually asked in.
 */
export function daysOfStock(
  item: Pick<InventoryItem, 'id' | 'stock'>,
  rows: readonly StockUsage[],
  days = 7,
): number | null {
  const used = rows.filter((row) => row.itemId === item.id);
  const total = totalSheets(used);
  if (total <= 0) return null;

  const perDay = total / days;
  const left = stockCount(item);
  if (left <= 0) return 0;
  return Math.floor(left / perDay);
}


/**
 * Keeps the shelf in step with one order.
 *
 * Booking «Бичгийн цаас А4 (10ш)» should take ten sheets off, and the three
 * things that can happen next all have to work:
 *
 *  * the quantity is corrected — the old draw is put back before the new one
 *    is taken, so 10 changed to 4 leaves the shelf six sheets better off, not
 *    fourteen worse;
 *  * the job is changed to something that is not paper — the old draw is put
 *    back and nothing replaces it;
 *  * the order is deleted — `log` is `null`, and the paper simply returns.
 *
 * Idempotent by construction: the previous automatic row is found by `logId`
 * and removed first, so running this twice on the same order cannot double the
 * deduction. Lines typed by hand carry no `logId` and are never touched.
 */
export interface PaperSync {
  usage: StockUsage[];
  inventory: InventoryItem[];
  /** The draw now standing against this order, for the message shown. */
  drawn: { name: string; sheets: number } | null;
}

export function syncPaperUsage(
  usage: readonly StockUsage[],
  inventory: readonly InventoryItem[],
  logId: number,
  log: { job?: string; quantity?: number | string; date?: string } | null,
  by: string,
  now: Date = new Date(),
): PaperSync {
  let nextUsage = [...usage];
  let nextInventory = [...inventory];

  const previous = usageForLog(nextUsage, logId);
  if (previous !== undefined) {
    nextInventory = revertUsage(nextInventory, previous.itemId, previous.quantity);
    nextUsage = nextUsage.filter((row) => row.id !== previous.id);
  }

  if (log === null) return { usage: nextUsage, inventory: nextInventory, drawn: null };

  const draw = paperFor(log, nextInventory);
  if (draw === null) return { usage: nextUsage, inventory: nextInventory, drawn: null };

  const entry = createUsage(
    {
      itemId: draw.item.id,
      itemName: draw.item.name,
      quantity: String(draw.sheets),
      note: 'Захиалгаар',
      by,
      ...(log.date === undefined ? {} : { date: log.date }),
      logId,
    },
    now,
  );

  return {
    usage: [entry, ...nextUsage],
    inventory: applyUsage(nextInventory, draw.item.id, draw.sheets),
    drawn: { name: draw.item.name, sheets: draw.sheets },
  };
}


/**
 * Books the paper for orders that never had it taken off.
 *
 * Deduction happens when an order is saved, which leaves two gaps: work booked
 * before the rule existed, and work booked by a device running an older build.
 * Both look the same from here — an order that names paper with no draw
 * against its id — and both are fixed the same way.
 *
 * Runs through `syncPaperUsage`, so it is the same arithmetic as the live path
 * and cannot double-count: an order that already has its draw is skipped by
 * `usageForLog` before anything is written.
 */
export interface Reconciliation {
  usage: StockUsage[];
  inventory: InventoryItem[];
  /** What was booked, for the message shown afterwards. */
  drawn: { name: string; sheets: number }[];
}

export const pendingPaperLogs = <T extends { id: number; job?: string; quantity?: number | string }>(
  logs: readonly T[],
  usage: readonly StockUsage[],
  inventory: readonly InventoryItem[],
): T[] =>
  logs.filter((log) => usageForLog(usage, log.id) === undefined && paperFor(log, inventory) !== null);

export function reconcilePaperUsage(
  usage: readonly StockUsage[],
  inventory: readonly InventoryItem[],
  logs: readonly { id: number; job?: string; quantity?: number | string; date?: string }[],
  by: string,
  now: Date = new Date(),
): Reconciliation {
  let nextUsage = [...usage];
  let nextInventory = [...inventory];
  const drawn: { name: string; sheets: number }[] = [];

  for (const log of logs) {
    if (usageForLog(nextUsage, log.id) !== undefined) continue;
    const result = syncPaperUsage(nextUsage, nextInventory, log.id, log, by, now);
    if (result.drawn === null) continue;
    nextUsage = result.usage;
    nextInventory = result.inventory;
    drawn.push(result.drawn);
  }

  return { usage: nextUsage, inventory: nextInventory, drawn };
}
