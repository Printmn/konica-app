import { STATUS_COLORS } from '@/theme/colors';
import type {
  InventoryItem,
  PickableProduct,
  ServiceItem,
  WorkLog,
  WorkLogForm,
} from '@/types';
import { peekDeviceId } from '@/services/device/deviceId';
import { nextId } from '@/utils/id';
import { MONTH_NAMES_MN, nowTimeString, shiftDate, todayString } from '@/utils/date';
import { parsePrice } from '@/utils/price';

/**
 * Work-log rules.
 *
 * Everything here came out of `WorkLogsTabOuter`. The functions are pure so the
 * screen stays a thin renderer and the tricky parts — the carry-over filter and
 * the quantity/price coupling — can be reasoned about on their own.
 */

/** A blank form. Matches `wlFormInit` exactly, including the defaults. */
export const emptyWorkLogForm = (): WorkLogForm => ({
  job: '',
  // Stamped, not blank. A job is booked at the counter with the customer
  // standing there, so "now" is right virtually every time — and the one field
  // nobody filled in was the one the board needed to say when work came in.
  // Still editable: a parcel dropped off at lunch and booked at four is typed.
  receivedTime: nowTimeString(),
  deadline: '',
  phone: '',
  delivery: '',
  note: '',
  status: '',
  color: '#ffffff',
  price: '',
  unitPrice: '',
  quantity: '',
  payType: '',
  isDelivery: false,
  isTomorrow: false,
  tomorrowDate: '',
  customer: '',
  customerType: '',
  paymentStatus: 'Төлөгдөөгүй',
  hasVat: false,
  orderDate: todayString(),
  agreedPrice: '',
});

/**
 * The rows shown on the "today" tab.
 *
 * Today's logs, *plus* anything from an earlier day that is still open. A job
 * only leaves the board once it is marked "Болсон" or "Болсон аваагүй", which
 * is why unfinished work keeps surfacing the next morning.
 */
/**
 * A job the shop is done with.
 *
 * Two statuses count: handed over, and finished but not yet collected. Both
 * mean nothing more is owed at the press — which is why the board stops
 * carrying them forward.
 */
export const isFinished = (log: Pick<WorkLog, 'status'>): boolean =>
  log.status === 'Болсон' || log.status === 'Болсон аваагүй';

export const visibleWorkLogs = (
  workLogs: readonly WorkLog[],
  archiveDate: string | null,
  today: string = todayString(),
): WorkLog[] => {
  const rows = archiveDate
    ? workLogs.filter((log) => log.date === archiveDate)
    : workLogs.filter(
        (log) =>
          log.date === today ||
          (log.date < today && !isFinished(log)),
      );
  return newestFirst(rows);
};

/**
 * Newest booking at the top.
 *
 * A new job is prepended locally, so it looks right until the next sync — and
 * then Firebase hands the collection back in its own order and the board
 * reshuffles. Sorting here means the order is the same on both devices, after
 * a reload, and the moment a job is booked.
 *
 * Within a day the day's own sequence number decides, falling back to the id
 * for rows booked before numbering existed.
 */
const newestFirst = (rows: readonly WorkLog[]): WorkLog[] =>
  [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const byNumber = (Number(b.no) || 0) - (Number(a.no) || 0);
    return byNumber !== 0 ? byNumber : b.id - a.id;
  });

/**
 * Everything finished and still on the shelf, oldest day first.
 *
 * «Болсон аваагүй» means the printing is done and the customer has not come
 * back for it. The board stops carrying those forward — nothing more is owed at
 * the press, so leaving them on today's column would bury the actual work — but
 * that is exactly why they go missing: a job finished three weeks ago is behind
 * an archive date nobody has a reason to open.
 *
 * Searched across the whole history rather than the visible board, because the
 * question this answers is "what is stacked up waiting to be collected", and a
 * parcel that has been waiting longest is the one worth chasing. Hence oldest
 * first — the opposite of every other list here, and deliberately so.
 */
export const notPickedUp = (workLogs: readonly WorkLog[]): WorkLog[] =>
  newestFirst(workLogs.filter((log) => log.status === 'Болсон аваагүй')).reverse();

/**
 * The three ways a job can still be hanging over the shop.
 *
 * Each names something unresolved, and each has its own way of disappearing
 * from the board:
 *
 *  * `notPicked` — printed, not collected. The board stops carrying it forward
 *    because no work is owed, which is precisely why it goes missing.
 *  * `settlement` — handed over on account. Marked «Болсон», so it leaves the
 *    board too, and what is left behind is money nobody is looking at.
 *  * `tomorrow` — promised for another day. This one does stay on the board,
 *    but mixed in with everything else booked since.
 *
 * All three are searched across the whole record rather than the visible
 * board. A count that only covered the last few days would answer a question
 * nobody is asking; «how much are we owed» has no date on it.
 */
export type BoardFilter = 'all' | 'notPicked' | 'settlement' | 'tomorrow';

const MATCHES: Record<Exclude<BoardFilter, 'all'>, (log: WorkLog) => boolean> = {
  notPicked: (log) => log.status === 'Болсон аваагүй',
  // Either field can carry it: the status is set when the job is closed out,
  // the payment status when it is booked, and the shop uses both.
  settlement: (log) => log.status === 'Тооцоотой' || log.paymentStatus === 'Тооцоотой',
  /**
   * Promised for another day and not handed over yet.
   *
   * `isTomorrow` is set when a collection date is picked and is never cleared
   * again — the job's *status* moves to «Болсон», the flag stays true forever.
   * Matching on the flag alone therefore returned every job the shop had ever
   * postponed, most of them collected weeks ago. What the chip is asked is
   * "what have we promised and not delivered", so finished work is excluded.
   */
  tomorrow: (log) =>
    !isFinished(log) && (log.status === 'Маргааш авна' || log.isTomorrow === true),
};

/**
 * Everything matching one of the three, longest outstanding first.
 *
 * Oldest first is the opposite of the board, and deliberate: a parcel that has
 * sat on the shelf for three weeks, or an invoice unpaid since June, is the one
 * worth acting on. The newest of them will keep.
 */
export const filterBoard = (workLogs: readonly WorkLog[], filter: BoardFilter): WorkLog[] => {
  if (filter === 'all') return [];
  return newestFirst(workLogs.filter(MATCHES[filter])).reverse();
};

export interface BoardFilterCounts {
  notPicked: number;
  settlement: number;
  tomorrow: number;
}

/** One pass for all three chips, so the header does not walk the record thrice. */
export const boardFilterCounts = (workLogs: readonly WorkLog[]): BoardFilterCounts => {
  const counts: BoardFilterCounts = { notPicked: 0, settlement: 0, tomorrow: 0 };
  for (const log of workLogs) {
    if (MATCHES.notPicked(log)) counts.notPicked += 1;
    if (MATCHES.settlement(log)) counts.settlement += 1;
    if (MATCHES.tomorrow(log)) counts.tomorrow += 1;
  }
  return counts;
};

/**
 * The board, cut into days.
 *
 * The board deliberately carries unfinished work forward, so a Thursday screen
 * can hold Monday's job, Tuesday's job and today's — and until now they were
 * one undivided column with no dates on the cards. Nobody could tell what had
 * been sitting there for three days.
 *
 * Grouping does not hide anything and does not reorder within a day; it only
 * puts a line and a name between one day and the next.
 */
export interface WorkLogGroup {
  /** `YYYY-MM-DD`, the day the jobs were booked. */
  date: string;
  /** «ӨНӨӨДӨР», «ӨЧИГДӨР», or «8-р сарын 7». */
  label: string;
  /** How many of the day's jobs are still outstanding. */
  pending: number;
  /**
   * An earlier day that still owes work.
   *
   * A past day whose jobs are all finished is *not* overdue — the archive view
   * shows completed days in full, and marking one «Болсон» has to take the
   * warning off it rather than leave the heading contradicting the card.
   */
  overdue: boolean;
  logs: WorkLog[];
}

/** `2026-08-07` → `8-р сарын 7`. */
export const dayLabel = (date: string, today: string = todayString()): string => {
  if (date === today) return 'ӨНӨӨДӨР';
  if (date === shiftDate(today, -1)) return 'ӨЧИГДӨР';
  if (date === shiftDate(today, 1)) return 'МАРГААШ';
  const [, month, day] = date.split('-');
  const name = MONTH_NAMES_MN[Number(month) - 1];
  if (!name || !day) return date;
  return `${name.replace('-р сар', '-р сарын')} ${Number(day)}`;
};

/**
 * Splits an already-sorted board into day groups.
 *
 * Order is inherited from the list it is handed rather than re-sorted, so the
 * one place that decides what comes first stays `newestFirst`.
 */
export const groupWorkLogsByDate = (
  logs: readonly WorkLog[],
  today: string = todayString(),
): WorkLogGroup[] => {
  const groups: WorkLogGroup[] = [];
  for (const log of logs) {
    const last = groups[groups.length - 1];
    if (last && last.date === log.date) {
      last.logs.push(log);
      if (!isFinished(log)) last.pending += 1;
      continue;
    }
    groups.push({
      date: log.date,
      label: dayLabel(log.date, today),
      pending: isFinished(log) ? 0 : 1,
      overdue: false,
      logs: [log],
    });
  }
  // Decided once the day is complete: a past day is only overdue while it
  // still has work left on it.
  for (const group of groups) {
    group.overdue = group.date < today && group.pending > 0;
  }
  return groups;
};

/**
 * When the job came over the counter.
 *
 * `receivedTime` is typed by hand and is often left blank, so the id — a
 * millisecond timestamp — stands in for it. Old rows carried forward show
 * their day as well, because on a board that holds three days at once «14:30»
 * on its own says nothing.
 */
export const intakeLabel = (
  log: Pick<WorkLog, 'receivedTime' | 'date' | 'id'>,
  today: string = todayString(),
): string => {
  const time = log.receivedTime || clockFromId(log.id, log.date);
  const sameDay = !log.date || log.date === today;
  if (sameDay) return time;

  const day = log.date.slice(5).replace('-', '/');
  return time ? `${day} ${time}` : day;
};

/**
 * `HH:MM` from a record id, when that id really is a booking timestamp.
 *
 * Ids have been millisecond timestamps since the web build, but only for rows
 * created on the day they claim — an imported or repaired row can carry an id
 * from another day entirely, and showing its clock time would be a lie. So the
 * day has to agree before the time is trusted.
 */
const clockFromId = (id: number, date: string): string => {
  if (!Number.isFinite(id) || id < 1_000_000_000_000) return '';
  const stamp = new Date(id);
  const iso = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(
    stamp.getDate(),
  ).padStart(2, '0')}`;
  if (date && iso !== date) return '';
  return `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
};

/** Distinct dates present in the log set, newest first. */
export const archiveDates = (workLogs: readonly WorkLog[]): string[] =>
  [...new Set(workLogs.map((log) => log.date))].sort().reverse();

/** Services + inventory flattened into one searchable product list. */
export const buildProductList = (
  services: readonly ServiceItem[],
  inventory: readonly InventoryItem[],
): PickableProduct[] => [
  ...services.map((service) => ({
    id: `s-${service.id}`,
    name: service.name,
    price: parsePrice(service.price),
    category: service.category,
    type: 'service' as const,
  })),
  ...inventory.map((item) => ({
    id: `i-${item.id}`,
    name: item.name,
    price: parsePrice(item.price),
    category: item.category,
    type: 'inventory' as const,
  })),
];

export const filterProducts = (
  products: readonly PickableProduct[],
  search: string,
): PickableProduct[] => {
  if (!search) return [...products];
  const needle = search.toLowerCase();
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(needle) ||
      (product.category || '').toLowerCase().includes(needle),
  );
};

/**
 * Recomputes the total when quantity changes.
 * An empty string is preserved so the field can be cleared while typing.
 */
export const applyQuantity = (form: WorkLogForm, rawQty: string): WorkLogForm => {
  const isBlank = rawQty === '';
  const qty = isBlank ? '' : Math.max(1, Number(rawQty) || 1);
  const unitPrice = Number(form.unitPrice) || 0;
  return {
    ...form,
    quantity: qty,
    price: isBlank ? '' : String(unitPrice * (Number(qty) || 1)),
  };
};

/** Recomputes the total when unit price changes. */
export const applyUnitPrice = (form: WorkLogForm, rawUnitPrice: string): WorkLogForm => {
  const unitPrice = Number(rawUnitPrice) || 0;
  const qty = Number(form.quantity) || 1;
  return { ...form, unitPrice: rawUnitPrice, price: String(unitPrice * qty) };
};

/**
 * Fills the form from a picked catalog product, keeping the current quantity.
 *
 * A blank quantity is written back as `1`. It was previously left blank while
 * the total was still computed as if it were one, so the form showed an empty
 * quantity box next to a filled-in price — and the next keystroke in that box
 * recalculated the total from scratch, appearing to change the price on its own.
 */
export const applyProduct = (form: WorkLogForm, product: PickableProduct): WorkLogForm => {
  const qty = Number(form.quantity) || 1;
  return {
    ...form,
    job: product.name,
    quantity: qty,
    unitPrice: String(product.price),
    price: String(product.price * qty),
  };
};

/**
 * Builds the log to insert.
 *
 * `no` is a per-day sequence number. Counting the day's rows gave the same
 * number twice as soon as one was deleted — delete #2 of three and the next job
 * is also numbered 3. Taking one past the highest number already used keeps it
 * unique for the day, and still starts at 1 each morning.
 */
export const createWorkLog = (
  form: WorkLogForm,
  existing: readonly WorkLog[],
  today: string = todayString(),
): WorkLog => {
  const date = form.orderDate || today;
  const highest = existing
    .filter((log) => log.date === date)
    .reduce((max, log) => Math.max(max, Number(log.no) || 0), 0);

  // The booking device is stamped on so the push notification can skip it —
  // nobody needs telling about a job they just typed in themselves.
  return { ...form, id: nextId(), date, no: highest + 1, deviceId: peekDeviceId() };
};

/**
 * Catalog photos, keyed by product name.
 *
 * A work log stores the job as free text, not as a reference to a catalog row,
 * so the only way back to the product's photo is its name. Matching is
 * case-insensitive and trimmed, because the name reaches the log through a
 * picker on some paths and through the keyboard on others.
 *
 * Services win over inventory on a name collision: a job on the board is a
 * thing the shop produced, not a thing on the shelf.
 */
export const productImageMap = (
  services: readonly ServiceItem[],
  inventory: readonly InventoryItem[],
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const item of inventory) {
    if (item.image) map.set(item.name.trim().toLowerCase(), item.image);
  }
  for (const service of services) {
    if (service.image) map.set(service.name.trim().toLowerCase(), service.image);
  }
  return map;
};

/**
 * The count shown after a job name on the board, or `''` when there is nothing
 * worth saying.
 *
 * A quantity of one is the default on every job, so printing it would put the
 * same noise on every row and make the rows that matter — an order of 250 —
 * harder to spot, not easier.
 */
export const quantityLabel = (log: Pick<WorkLog, 'quantity'>): string => {
  const count = Number(log.quantity);
  if (!Number.isFinite(count) || count <= 1) return '';
  return `×${count}`;
};

/** A job whose own name already ends in `(9ш)`, as quick orders write it. */
const NAMES_ITS_COUNT = /\(\s*\d+\s*ш\s*\)\s*$/u;

/**
 * The quantity, unless the job title has already said it.
 *
 * `buildQuickOrder` bakes the count into the name — «Бичиг баримт канон (9ш)» —
 * *and* stores it in `quantity`, so printing both gives «… (9ш) ×9». Harmless
 * on a card with room to spare, but the archive row is one line and the second
 * number is the thing that pushes the price off the end of it.
 */
export const countSuffix = (log: Pick<WorkLog, 'quantity' | 'job'>): string =>
  NAMES_ITS_COUNT.test(log.job ?? '') ? '' : quantityLabel(log);

/**
 * The handover deadline, as a person reads it.
 *
 * «Маргааш» started as a plain flag and is now a chosen day, so a job may be
 * due next Tuesday rather than tomorrow. The word "Маргааш" is only correct
 * when no day was picked — printing it beside a date a week out would tell the
 * shop the wrong thing, and the Excel export is what the shop reconciles from.
 */
export const deadlineLabel = (
  log: Pick<WorkLog, 'deadline' | 'isTomorrow' | 'tomorrowDate'>,
): string => {
  const time = log.deadline || '';
  if (!log.isTomorrow) return time;

  const day = log.tomorrowDate ?? '';
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(5).replace('-', '/') : 'Маргааш';
  return time ? `${shown} ${time}` : shown;
};

/** The photo for one job, or `null` when the catalog has none. */
export const imageForJob = (images: Map<string, string>, job: string): string | null =>
  images.get(job.trim().toLowerCase()) ?? null;

/**
 * The unit price of a booked job.
 *
 * `price` on a work log is the *line total* — unit price times quantity — so
 * handing it to a document as the unit price multiplied the job by its quantity
 * a second time: 10 × ₮1,300 arrived on the invoice as 10 × ₮13,000.
 *
 * The stored `unitPrice` is the answer where there is one. Older rows and rows
 * booked before that field existed carry only a total, so it is divided back
 * out by the quantity rather than left to inflate the document.
 */
export const unitPriceOf = (log: Pick<WorkLog, 'price' | 'unitPrice' | 'quantity'>): number => {
  const stored = Number(log.unitPrice);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const total = Number(log.price) || 0;
  const quantity = Number(log.quantity) || 1;
  return quantity > 1 ? Math.round(total / quantity) : total;
};

/**
 * Loads an existing job back into the form for editing.
 *
 * `orderDate` is taken from the row's actual `date` rather than from the stored
 * `orderDate` field, which older rows do not always carry. Without that a job
 * booked yesterday would be saved back onto today and vanish off the board it
 * was edited from.
 */
export const workLogToForm = (log: WorkLog): WorkLogForm => {
  const { id: _id, date, no: _no, ...rest } = log;
  return { ...rest, orderDate: date };
};

/**
 * Writes an edited form back onto the job it came from.
 *
 * The identity of the row — its `id`, and its `no` within the day — is kept.
 * Renumbering on every edit would reshuffle the board and break the sequence
 * printed on the day's export.
 */
export const applyWorkLogEdit = (log: WorkLog, form: WorkLogForm): WorkLog => ({
  ...log,
  ...form,
  id: log.id,
  date: log.date,
  no: log.no,
});

export const validateWorkLog = (form: WorkLogForm): string | null =>
  form.job.trim() ? null : 'Ажлын нэрийг оруулна уу.';

/**
 * Row tint for a work log. Same precedence as the Excel exporter — status wins
 * over payment status, and `isTomorrow` acts as a fallback for "маргааш авна".
 */
export const workLogRowColor = (log: Pick<WorkLog, 'status' | 'paymentStatus' | 'isTomorrow'>): string => {
  const status = log.status || '';
  const payment = log.paymentStatus || '';
  if (status === 'Болсон') return STATUS_COLORS.done;
  if (status === 'Болсон аваагүй') return STATUS_COLORS.doneNotPicked;
  if (status === 'Маргааш авна' || log.isTomorrow) return STATUS_COLORS.tomorrow;
  if (status === 'Тооцоотой' || status === 'Болоогүй' || payment === 'Тооцоотой')
    return STATUS_COLORS.settlement;
  return STATUS_COLORS.pending;
};

/** The single-word performance cell used in exports and the status chip. */
export const performanceLabel = (log: WorkLog): string => {
  if (log.paymentStatus === 'Урьдчилгаа') return 'Урьдчилгаа';
  if (log.paymentStatus === 'Тооцоотой') return 'Тооцоо аваагүй';
  return log.status || 'Болсон';
};
