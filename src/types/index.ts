/**
 * Domain types.
 *
 * These mirror the *exact* shapes that already live in the Firebase Realtime
 * Database under `/pmn/*`. Nothing here renames or restructures a field — the
 * web app and this app read and write the same documents.
 */

// ─────────────────────────── Roles & auth ───────────────────────────

export type Role = 'manager' | 'ipad' | 'worker';

export type LoginStep = 'ipad-pin' | 'manager-pin' | 'worker-pin' | null;

export interface Session {
  readonly role: Role;
  readonly workerName: string;
}

// ─────────────────────────── Payments ───────────────────────────

export type PayType = 'Данс' | 'Бэлэн' | 'Карт' | 'Бусад' | '';

/** The three states the work-log form offers. */
export type PaymentStatus = 'Төлөгдөөгүй' | 'Урьдчилгаа' | 'Төлөгдсөн' | '';

/**
 * What may actually come back from the database. The form stopped offering
 * "Тооцоотой", but records written before that still carry it, so every read
 * path — row colours, Excel tints, the performance label — must keep handling
 * it. Only the form is narrowed to `PaymentStatus`.
 */
export type StoredPaymentStatus = PaymentStatus | 'Тооцоотой';

export type WorkStatus =
  | 'Болсон'
  | 'Болсон аваагүй'
  | 'Маргааш авна'
  | 'Тооцоотой'
  | 'Болоогүй'
  | '';

// ─────────────────────────── Catalog ───────────────────────────

/** Price is stored as a display string such as `'8,500₮'`. Never a number. */
export interface InventoryItem {
  id: number;
  name: string;
  price: string;
  stock: string;
  image: string | null;
  category: string;
}

export interface ServiceItem {
  id: number;
  name: string;
  price: string;
  category: string;
  image: string | null;
}

/** A service or inventory row, flattened for the product picker. */
export interface PickableProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  type: 'service' | 'inventory';
}

// ─────────────────────────── Work logs ───────────────────────────

export interface WorkLog {
  id: number;
  date: string; // YYYY-MM-DD
  no?: number;
  job: string;
  receivedTime: string;
  deadline: string;
  phone: string;
  delivery: string;
  note: string;
  status: WorkStatus;
  color: string;
  price: string;
  unitPrice: string;
  quantity: number | string;
  payType: PayType;
  isDelivery: boolean;
  isTomorrow: boolean;
  customer: string;
  customerType: string;
  paymentStatus: StoredPaymentStatus;
  hasVat: boolean;
  orderDate: string;
  agreedPrice: string;
}

/** The editable subset used by the work-log form (no id/date/no yet). */
export type WorkLogForm = Omit<WorkLog, 'id' | 'date' | 'no'>;

// ─────────────────────────── Quick orders ───────────────────────────

export interface Order {
  id: number;
  paymentType: PayType;
  desc: string;
  price: number;
  time: string;
}

// ─────────────────────────── Attendance & habits ───────────────────────────

export type TaskType = 'cleaning' | 'habit';

export interface HabitTask {
  id: number;
  text: string;
  done: boolean;
  type: TaskType;
  score: number;
}

export interface AttendanceLog {
  id: number;
  name: string;
  time: string;
  status: string;
  penalty: number;
  isLate: boolean;
  checked: boolean;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  completedTasks: number[];
  completedTaskCount: number;
  totalTaskCount: number;
  completedScore: number;
  totalPossibleScore: number;
}

export interface TimeSettings {
  startTime: string; // HH:mm
  penaltyPerMin: number;
  onTimeScore: number;
  onLeaveScore: number;
  workingDays: number;
}

/** `restDays` uses JS weekday indices: 0 = Sunday … 6 = Saturday. */
export interface Employee {
  id: number;
  name: string;
  pin: string;
  restDays: number[];
}

// ─────────────────────────── Performance ───────────────────────────

export interface EmployeePerformance {
  name: string;
  days: number;
  onTime: number;
  late: number;
  tasksDone: number;
  tasksTotal: number;
  completedScore: number;
  workDays: number;
  restDays: number[];
  score: number;
  maxScore: number;
  pct: number;
  bonus: number;
}

// ─────────────────────────── Settings ───────────────────────────

export interface ColorLabel {
  id: number;
  color: string;
  label: string;
}

export interface CalcType {
  id: number;
  name: string;
  base: number;
}

// ─────────────────────────── Quotation ───────────────────────────

export type DocType = 'quotation' | 'invoice' | 'receipt';

export interface QuotationItem {
  id: number;
  name: string;
  format: string;
  material: string;
  qty: number;
  unitPrice: string;
}

/**
 * Which payment this document is asking for.
 *
 * `full` is the whole job. `advance` bills a percentage up front. `balance`
 * bills what is left after an advance that was already paid — so it needs to
 * know how much that was.
 */
export type PaymentKind = 'full' | 'advance' | 'balance';

export interface QuotationForm {
  customer: string;
  phone: string;
  date: string;
  readyTime: string;
  vatIncluded: boolean;
  showTotal: boolean;
  items: QuotationItem[];

  /** Invoice number printed in the heading. Blank prints a dash. */
  docNumber: string;
  /** Payment due date; blank means the same day the document is dated. */
  dueDate: string;
  /** Discount taken off the line-item total, as a percentage. */
  discountPercent: number;
  paymentKind: PaymentKind;
  /** Percentage billed when `paymentKind` is `advance`. */
  advancePercent: number;
  /** Advance already received, deducted when `paymentKind` is `balance`. */
  advancePaid: number;
  /** Print the signature lines at the foot of the document. */
  showSignature: boolean;
  /** Print the amount written out in words. */
  showAmountInWords: boolean;
}

export interface QuotationPrefill {
  customer?: string;
  vatIncluded?: boolean;
  docType?: DocType;
  items?: { name: string; qty: number; unitPrice: string }[];
}

export interface WorkLogPrefill {
  job: string;
  price: number;
}

// ─────────────────────────── Chat ───────────────────────────

/**
 * One message in the shop's single group chat.
 *
 * Stored remotely under `/pmn/chat/<id>`, one node per message, so two phones
 * sending at the same moment cannot overwrite each other. `deviceId` — not a
 * user account — decides whose bubble it is; the shop shares PINs rather than
 * personal logins, so there is deliberately no profile system.
 */
export interface ChatMessage {
  /** Unique, sortable, generated on the sending device. */
  id: string;
  /** Display name at send time (Менежер / iPad / ажилтны нэр). */
  sender: string;
  text: string;
  /** `HH:mm`, for display. */
  time: string;
  /** Epoch ms — the ordering key. */
  at: number;
  /** Which device sent it; compared against the local id to find "mine". */
  deviceId: string;
  image: string | null;
  /** Client-only: queued locally, not yet accepted by the server. */
  pending?: boolean;
  /** Client-only: predates sync, so it exists on this device alone. */
  legacy?: boolean;
}

// ─────────────────────────── Reports ───────────────────────────

export interface DailyReport {
  totalRevenue: number;
  totalTransfer: number;
  totalCash: number;
  totalCard: number;
  totalVat: number;
  logs: WorkLog[];
}

export interface MonthlyRevenue {
  totalRevenue: number;
  revenueByType: Record<string, number>;
  orderCount: number;
}

// ─────────────────────────── Infrastructure ───────────────────────────

/** Every remote collection key that lives under `/pmn/<key>.json`. */
export type RemoteKey =
  | 'orders'
  | 'worklogs'
  | 'logs'
  | 'employees'
  | 'colorlabels'
  | 'calctypes'
  | 'timesettings'
  | 'inventory'
  | 'services'
  | 'tasks'
  | 'chat';

export type AsyncState = 'idle' | 'loading' | 'success' | 'error';

export type AppErrorKind =
  | 'network'
  | 'permission'
  | 'firebase'
  | 'validation'
  | 'storage'
  | 'unknown';

export interface AppError {
  kind: AppErrorKind;
  message: string;
  cause?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * A write that could not reach Firebase and is waiting to be retried.
 *
 * `child` is what makes concurrent editing safe: a write that names a single
 * record touches only that record, so two devices adding work logs in the same
 * sync window no longer overwrite one another. `child: null` is the old
 * whole-collection PUT, still used for settings and for the one-time migration
 * that converts a legacy array node into a keyed map.
 */
export interface QueuedWrite {
  id: string;
  key: RemoteKey;
  /** Record id within the collection, or `null` for the whole collection. */
  child: string | null;
  op: 'put' | 'delete';
  payload: unknown;
  queuedAt: number;
  attempts: number;
}
