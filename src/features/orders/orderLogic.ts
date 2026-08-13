import { peekDeviceId } from '@/services/device/deviceId';
import type { Order, PayType, WorkLog, WorkLogForm } from '@/types';
import { nowTimeString, toDateString } from '@/utils/date';
import { nextId } from '@/utils/id';

/**
 * Quick-order creation.
 *
 * The catalog tap and the free-price ("тохиролцоо") modal both create *two*
 * records: an `Order` for the day's till, and a mirrored `WorkLog` so the entry
 * shows up in the daily report and the Excel export. Skipping the mirror is the
 * single easiest way to make revenue silently disappear, so both writes are
 * produced together here and the caller applies them as a pair.
 */

export interface QuickOrderInput {
  description: string;
  unitPrice: number;
  quantity: number;
  payType: PayType;
  /**
   * `HH:MM` the job came over the counter, when the clerk has adjusted it.
   *
   * Left out it means "now", which is the case that matters — the quick screen
   * exists to book a sale in two taps. It is here at all because the counter
   * writes a batch up after the fact, and stamping four jobs with the same
   * closing-time minute makes the day's sequence unreadable.
   */
  receivedTime?: string;
  now?: Date;
}

export interface QuickOrderResult {
  order: Order;
  workLog: WorkLog;
}

export function buildQuickOrder(
  input: QuickOrderInput,
  existingLogs: readonly WorkLog[],
): QuickOrderResult {
  const { description, unitPrice, quantity, payType, receivedTime, now = new Date() } = input;

  const total = unitPrice * quantity;
  const time = receivedTime?.trim() || nowTimeString(now);
  const date = toDateString(now);
  const label = `${description} (${quantity}ш)`;

  const order: Order = {
    id: nextId(),
    paymentType: payType,
    desc: label,
    price: total,
    time,
  };

  /**
   * The order and its mirrored log each take their own id.
   *
   * This used to be `Date.now()` and `Date.now() + 1`. Two quick orders booked
   * inside the same millisecond — one on the counter iPad, one on the phone —
   * produced identical ids, and since a record is stored under its id in
   * Firebase, one of the two sales simply overwrote the other. `nextId` never
   * hands out the same number twice.
   */
  const workLog: WorkLog = {
    id: nextId(),
    date,
    no: existingLogs.filter((log) => log.date === date).length + 1,
    job: label,
    price: String(total),
    payType,
    receivedTime: time,
    paymentStatus: 'Төлөгдөөгүй',
    status: '',
    note: '',
    phone: '',
    deadline: '',
    isDelivery: false,
    isTomorrow: false,
    delivery: '',
    color: '#ffffff',
    unitPrice: String(unitPrice),
    quantity,
    customer: '',
    customerType: '',
    hasVat: false,
    orderDate: date,
    agreedPrice: '',
    // Recorded so the push notification skips the device that booked it.
    deviceId: peekDeviceId(),
  };

  return { order, workLog };
}

/** Prefill payload handed to the work-log form when coming from the calculator. */
export const toWorkLogPrefill = (job: string, price: number): Partial<WorkLogForm> => ({
  job,
  price: String(price),
  unitPrice: String(price),
  quantity: 1,
});

export const validateCustomOrder = (price: string): string | null => {
  const value = Number(String(price).replace(/[^0-9]/g, ''));
  return value > 0 ? null : 'Үнийг оруулна уу.';
};
