import { STATUS_COLORS } from '@/theme/colors';
import type {
  InventoryItem,
  PickableProduct,
  ServiceItem,
  WorkLog,
  WorkLogForm,
} from '@/types';
import { nextId } from '@/utils/id';
import { todayString } from '@/utils/date';
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
  receivedTime: '',
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
export const visibleWorkLogs = (
  workLogs: readonly WorkLog[],
  archiveDate: string | null,
  today: string = todayString(),
): WorkLog[] => {
  if (archiveDate) return workLogs.filter((log) => log.date === archiveDate);
  return workLogs.filter(
    (log) =>
      log.date === today ||
      (log.date < today && log.status !== 'Болсон' && log.status !== 'Болсон аваагүй'),
  );
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

  return { ...form, id: nextId(), date, no: highest + 1 };
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
