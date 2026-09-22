/**
 * Per-record type guards.
 *
 * Every collection used to be validated by one rule — "has a numeric id" — so a
 * row whose `price` had arrived as a number, or whose `name` was missing
 * entirely, sailed through and blew up later in a screen that assumed a string.
 *
 * The guards below are deliberately *permissive* about optional fields and
 * strict only about what the app actually depends on. That balance is the whole
 * point: tightening them further would start rejecting rows the shop has been
 * accumulating since the web build, and a validator that silently deletes real
 * data is far worse than one that lets an odd field through.
 *
 * Kept free of React Native imports so the rules can be unit tested directly.
 */

export const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/** Present and a string. */
const str = (value: unknown): boolean => typeof value === 'string';

/** Absent, null, or a string — the shape of every optional text field here. */
const optionalStr = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'string';

/** Prices and quantities have always been stored as either, so accept both. */
const numberish = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  typeof value === 'number' ||
  typeof value === 'string';

const optionalBool = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'boolean';

/** A usable primary key: finite, non-negative, and not `NaN`. */
export const hasValidId = (raw: unknown): boolean =>
  isRecord(raw) && typeof raw.id === 'number' && Number.isFinite(raw.id) && raw.id >= 0;

/** A non-empty display name — the one field a list row cannot render without. */
const hasName = (raw: Record<string, unknown>, field = 'name'): boolean =>
  str(raw[field]) && (raw[field] as string).trim().length > 0;

// ── Collections ──────────────────────────────────────────────────────

/**
 * `/pmn/orders` also receives customer orders pushed by the website, which have
 * no numeric `id` at all. Those are *not* rejected here — they are simply not
 * this app's rows, and `RecordRepository` leaves anything that fails a guard
 * untouched on the server.
 */
export const isOrder = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  numberish(raw.price) &&
  optionalStr(raw.desc) &&
  optionalStr(raw.paymentType) &&
  optionalStr(raw.time);

export const isWorkLog = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  optionalStr(raw.date) &&
  optionalStr(raw.job) &&
  numberish(raw.price) &&
  numberish(raw.quantity) &&
  optionalStr(raw.payType) &&
  optionalStr(raw.status) &&
  optionalBool(raw.hasVat) &&
  optionalBool(raw.isDelivery) &&
  optionalBool(raw.isTomorrow);

export const isAttendanceLog = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  hasName(raw) &&
  optionalStr(raw.date) &&
  optionalStr(raw.month) &&
  optionalStr(raw.time) &&
  optionalStr(raw.status) &&
  optionalBool(raw.isLate);

/**
 * `pin` is checked for *type* but not required.
 *
 * Dropping a PIN-less employee would quietly remove them from the roster and
 * from the attendance name picker, taking their history out of the monthly
 * report with them. Not being able to log in is a smaller problem than
 * disappearing, so the row stays.
 */
export const isEmployee = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  hasName(raw) &&
  optionalStr(raw.pin) &&
  (raw.restDays === undefined ||
    raw.restDays === null ||
    (Array.isArray(raw.restDays) && raw.restDays.every((day) => typeof day === 'number')));

export const isInventoryItem = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  hasName(raw) &&
  numberish(raw.price) &&
  numberish(raw.stock) &&
  optionalStr(raw.category) &&
  optionalStr(raw.image);

export const isServiceItem = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  hasName(raw) &&
  numberish(raw.price) &&
  optionalStr(raw.category) &&
  optionalStr(raw.image);

export const isHabitTask = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  hasName(raw, 'text') &&
  (raw.score === undefined || raw.score === null || typeof raw.score === 'number') &&
  optionalBool(raw.done) &&
  optionalStr(raw.type);

export const isExpense = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  optionalStr(raw.date) &&
  optionalStr(raw.category) &&
  numberish(raw.amount) &&
  optionalStr(raw.note) &&
  optionalStr(raw.by);

export const isAnnouncement = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  optionalStr(raw.date) &&
  optionalStr(raw.title) &&
  optionalStr(raw.body) &&
  optionalStr(raw.by);

export const isStockUsage = (raw: unknown): boolean =>
  hasValidId(raw) &&
  isRecord(raw) &&
  optionalStr(raw.date) &&
  numberish(raw.itemId) &&
  optionalStr(raw.itemName) &&
  numberish(raw.quantity);

/** Colour labels and calculator types are little more than id + label. */
export const isSimpleRecord = (raw: unknown): boolean => hasValidId(raw);
