/**
 * Date helpers.
 *
 * The whole app speaks two string formats and nothing else:
 *   - a day:   `YYYY-MM-DD`
 *   - a month: `YYYY-MM`
 *
 * They are produced with local-time getters (never `toISOString`) because the
 * shop operates in Mongolia and UTC would roll the day over at 08:00 local.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `2026-08-03` for the given date, or today. */
export const toDateString = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `2026-08` for the given date, or this month. */
export const toMonthString = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const todayString = (): string => toDateString();
export const currentMonthString = (): string => toMonthString();

/** `14:05` — matches `toLocaleTimeString([], { hour, minute })` from the web app. */
export const nowTimeString = (d: Date = new Date()): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Minutes since midnight for an `HH:mm` string. Returns 0 for malformed input. */
export const timeToMinutes = (time: string): number => {
  const parts = time.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

export const MONTH_NAMES_MN = [
  '1-р сар',
  '2-р сар',
  '3-р сар',
  '4-р сар',
  '5-р сар',
  '6-р сар',
  '7-р сар',
  '8-р сар',
  '9-р сар',
  '10-р сар',
  '11-р сар',
  '12-р сар',
] as const;

/** `2026-08` → `2026 оны 8-р сар`. */
export const monthLabel = (month: string): string => {
  const [year, mo] = month.split('-');
  const index = parseInt(mo ?? '1', 10) - 1;
  return `${year ?? ''} оны ${MONTH_NAMES_MN[index] ?? ''}`;
};

/** Steps a `YYYY-MM` string by `dir` months, clamped so it never goes past now. */
export const shiftMonth = (month: string, dir: number): string => {
  const [yRaw, mRaw] = month.split('-').map(Number);
  const y = yRaw ?? new Date().getFullYear();
  const m = mRaw ?? 1;
  let ny = y;
  let nm = m + dir;
  if (nm < 1) {
    ny -= 1;
    nm = 12;
  }
  if (nm > 12) {
    ny += 1;
    nm = 1;
  }
  const next = `${ny}-${pad(nm)}`;
  return next > currentMonthString() ? month : next;
};

export const DAY_LABELS_MN = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'] as const;

/** Number of calendar days in the given `YYYY-MM`. */
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y ?? 1970, m ?? 1, 0).getDate();
};

/**
 * Steps a `YYYY-MM-DD` string by whole days, rolling months and years over
 * correctly. Built from local-time parts, never `Date.parse`, which would read
 * the string as UTC and land a day early in Mongolia.
 */
export const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return date;
  return toDateString(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
};

/** Weekday index (0 = Sunday) of a `YYYY-MM-DD` string, or 0 if unreadable. */
export const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
};

export const longDateLabel = (d: Date = new Date()): string =>
  `${d.getFullYear()} оны ${MONTH_NAMES_MN[d.getMonth()]} ${d.getDate()}`;
