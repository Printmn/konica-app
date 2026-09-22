import { timeToMinutes } from '@/utils/date';

/**
 * «Цагаа бүртгүүлээрэй» — the nudges before a shift starts.
 *
 * Three of them, half an hour out and then every ten minutes. The point is not
 * to be informative; by 09:50 everybody knows what time they start. It is to
 * arrive while there is still time to do something about it, which a reminder
 * fired *at* ten o'clock cannot.
 *
 * Pure so the schedule can be reasoned about without a device: the screen
 * hands over the shift time and a clock, and gets back the moments to fire.
 */

/** How long before the shift each nudge lands. */
export const LEAD_MINUTES = [30, 20, 10] as const;

/**
 * Used when the shop's start time is missing or unparseable.
 *
 * `timeToMinutes('')` is 0, which reads as midnight: without this a blank
 * setting makes every arrival «607 мин хоцорсон» and schedules three reminders
 * for the small hours. A wrong-but-sane 10:00 is recoverable; midnight is not.
 */
export const DEFAULT_START = '10:00';

/** Used when the shop's end time is missing or unparseable. */
export const DEFAULT_END = '18:30';

const parsed = (time: string, fallback: string): number => {
  const raw = (time || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return timeToMinutes(fallback);
  const minutes = timeToMinutes(raw);
  return minutes > 0 ? minutes : timeToMinutes(fallback);
};

/** Minutes past midnight of the shift start, never midnight by accident. */
export const startMinutesOf = (startTime: string): number => parsed(startTime, DEFAULT_START);

/** Minutes past midnight of the shift end. */
export const endMinutesOf = (endTime: string | undefined): number =>
  parsed(endTime ?? '', DEFAULT_END);

export interface Reminder {
  /** 30, 20 or 10. */
  lead: number;
  /** When it fires, as minutes past midnight. */
  atMinutes: number;
  /** `09:30` — the clock time it fires at. */
  at: string;
  body: string;
}

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The nudges still ahead of `nowMinutes`.
 *
 * Ones already past are dropped rather than fired late: a phone unlocked at
 * 09:55 should get the ten-minute warning and nothing else, not a burst of
 * three saying half an hour is left when it is not.
 *
 * Empty once the shift has started. Being told to clock in at 10:20 by a
 * reminder that calls itself «30 минут үлдлээ» is worse than silence.
 */
export function pendingReminders(startTime: string, nowMinutes: number): Reminder[] {
  const start = startMinutesOf(startTime);
  return LEAD_MINUTES.filter((lead) => start - lead > nowMinutes).map((lead) => ({
    lead,
    atMinutes: start - lead,
    at: clock(start - lead),
    body:
      lead === 10
        ? `Ажил эхлэхэд 10 минут үлдлээ — цагаа бүртгүүлээрэй`
        : `Ажил эхлэхэд ${lead} минут үлдлээ`,
  }));
}

/** Seconds from now until a reminder fires; never negative. */
export const secondsUntil = (reminder: Reminder, nowMinutes: number, nowSeconds = 0): number =>
  Math.max(1, (reminder.atMinutes - nowMinutes) * 60 - nowSeconds);

/**
 * Whether this person still owes the shop a clock-in today.
 *
 * Reminders are pointless once they have registered, and a phone that keeps
 * buzzing after the fact is a phone whose notifications get turned off.
 */
export const hasClockedIn = (
  logs: readonly { name: string; date: string }[],
  name: string,
  date: string,
): boolean => {
  const who = name.trim().toLowerCase();
  if (who === '') return false;
  return logs.some((log) => log.date === date && log.name.trim().toLowerCase() === who);
};

/**
 * How early somebody may clock in before it looks like they did it from bed.
 *
 * Twenty minutes: the shop's own window — «09:40–10:00 бол цагтаа» — and long
 * enough to cover the walk in and the kettle. Earlier than that is still on
 * time and still scores; it is only *labelled*, because a 06:00 arrival on a
 * ten o'clock shift is a phone being tapped at home, not somebody at the
 * counter, and the manager should be able to see the difference without
 * anybody losing a point over it.
 */
export const EARLY_WINDOW_MINUTES = 20;

export const isEarlyArrival = (arrivalMinutes: number, startMinutes: number): boolean =>
  arrivalMinutes < startMinutes - EARLY_WINDOW_MINUTES;

/**
 * How early somebody may leave before it counts as going early.
 *
 * Five minutes: packing up as the clock turns is not leaving early, and
 * flagging it would make the figure meaningless within a week. Unlike the
 * arrival window this one is tight, because the end of a shift is a moment
 * people already round in their own favour.
 */
export const LEAVE_GRACE_MINUTES = 5;

export interface Departure {
  status: string;
  early: boolean;
  /** Minutes on the clock, start to leaving. Never negative. */
  workedMinutes: number;
}

/**
 * What to record when somebody clocks out.
 *
 * Staying late is not called out: hours past the end are the shop's gain and
 * announcing them invites the kind of competition a small team does not need.
 * It is still in the figure, because `workedMinutes` is what the manager reads
 * when a month looks wrong.
 */
export function describeDeparture(
  leaveMinutes: number,
  arrivalMinutes: number,
  endTime: string | undefined,
): Departure {
  const end = endMinutesOf(endTime);
  const workedMinutes = Math.max(0, leaveMinutes - arrivalMinutes);
  if (leaveMinutes < end - LEAVE_GRACE_MINUTES) {
    return { status: `${end - leaveMinutes} мин эрт тарсан`, early: true, workedMinutes };
  }
  return { status: 'Цагтаа тарсан', early: false, workedMinutes };
}

/** `8ц 25м` — worked time as a person says it. */
export const workedLabel = (minutes: number): string => {
  if (minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest}м` : `${hours}ц ${String(rest).padStart(2, '0')}м`;
};
