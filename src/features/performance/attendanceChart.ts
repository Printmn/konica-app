import type { AttendanceLog, EmployeePerformance } from '@/types';
import { shiftDate, timeToMinutes, todayString } from '@/utils/date';

/**
 * Ирц & дадал, drawn rather than listed.
 *
 * The manager already has the numbers — a table of them, per person, per
 * month. What a table cannot show is shape: that Bat has been ten minutes late
 * every Monday for three weeks, or that the whole shop's habit score fell off
 * the day the printer broke. Both are obvious in a bar and invisible in a
 * column of figures.
 *
 * Pure, so the shapes can be checked without a device.
 */

const WEEKDAYS = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'] as const;

interface DayTally {
  onTime: number;
  late: number;
  score: number;
  max: number;
  worked: number;
  open: number;
}

/**
 * Clock-in to clock-out, in minutes. `null` while the shift is still open.
 *
 * `null` rather than 0, because the two mean opposite things: nought hours is
 * somebody who came and went in the same minute, an open shift is somebody
 * still at the counter. Averaging them together would pull the shop's figure
 * down every afternoon and back up each evening.
 */
export const workedMinutesOf = (log: {
  time?: string;
  leaveTime?: string;
}): number | null => {
  if (!log.leaveTime || !log.time) return null;
  return Math.max(0, timeToMinutes(log.leaveTime) - timeToMinutes(log.time));
};

export interface DayBar {
  date: string;
  /** `Да` — the weekday, which is what a bar is read by. */
  label: string;
  onTime: number;
  late: number;
  /** Habit points earned that day across everyone who clocked in. */
  score: number;
  /** Clock-in to clock-out, summed across everyone who closed their day. */
  workedMinutes: number;
  /** How many of the day's arrivals have not clocked out yet. */
  openShifts: number;
  /** Points available that day — the bar's ceiling. */
  maxScore: number;
  /** 0–1 of the score against the day's ceiling. */
  height: number;
  isToday: boolean;
}

/**
 * The last `days` days, oldest on the left.
 *
 * Height is the day's score against *that day's* ceiling rather than against
 * the busiest day in the window. A shop where two people worked Monday and
 * four worked Tuesday has a higher ceiling on Tuesday, and scaling to the
 * tallest bar would make a perfect Monday look like a bad one.
 *
 * A day nobody clocked in has no ceiling and draws empty — not zero, which
 * would read as "everybody failed" rather than "the shop was shut".
 */
export function attendanceBars(
  logs: readonly AttendanceLog[],
  options: { days?: number; today?: string } = {},
): DayBar[] {
  const { days = 14, today = todayString() } = options;

  const blank = (): DayTally => ({ onTime: 0, late: 0, score: 0, max: 0, worked: 0, open: 0 });
  const byDay = new Map<string, DayTally>();
  for (const log of logs) {
    if (!log.date) continue;
    const day = byDay.get(log.date) ?? blank();
    if (log.isLate) day.late += 1;
    else day.onTime += 1;
    day.score += Number(log.completedScore) || 0;
    day.max += Number(log.totalPossibleScore) || 0;
    // Only a closed day contributes hours. An open one is not «zero hours» —
    // it is a shift still running, which is why it is counted separately.
    const worked = workedMinutesOf(log);
    if (worked === null) day.open += 1;
    else day.worked += worked;
    byDay.set(log.date, day);
  }

  const window: DayBar[] = [];
  for (let step = days - 1; step >= 0; step -= 1) {
    const date = shiftDate(today, -step);
    const day = byDay.get(date) ?? blank();
    const [year, month, dayOfMonth] = date.split('-').map(Number);
    const weekday = new Date(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1).getDay();
    window.push({
      date,
      label: WEEKDAYS[weekday] ?? '',
      onTime: day.onTime,
      late: day.late,
      score: day.score,
      maxScore: day.max,
      workedMinutes: day.worked,
      openShifts: day.open,
      height: day.max > 0 ? Math.min(1, day.score / day.max) : 0,
      isToday: date === today,
    });
  }
  return window;
}

export interface ChartTotals {
  onTime: number;
  late: number;
  /** Share of arrivals that were on time, 0–1. `null` when there were none. */
  punctuality: number | null;
  score: number;
  maxScore: number;
  /** Hours on the clock across the window. */
  workedMinutes: number;
  openShifts: number;
}

export const chartTotals = (bars: readonly DayBar[]): ChartTotals => {
  const onTime = bars.reduce((sum, bar) => sum + bar.onTime, 0);
  const late = bars.reduce((sum, bar) => sum + bar.late, 0);
  return {
    onTime,
    late,
    punctuality: onTime + late > 0 ? onTime / (onTime + late) : null,
    score: bars.reduce((sum, bar) => sum + bar.score, 0),
    maxScore: bars.reduce((sum, bar) => sum + bar.maxScore, 0),
    workedMinutes: bars.reduce((sum, bar) => sum + bar.workedMinutes, 0),
    openShifts: bars.reduce((sum, bar) => sum + bar.openShifts, 0),
  };
};

export interface PersonBar {
  name: string;
  onTime: number;
  late: number;
  score: number;
  maxScore: number;
  /** 0–1 of score against the ceiling — the length of the bar. */
  ratio: number;
  /** 0–1 of arrivals that were on time. `null` when they never came in. */
  punctuality: number | null;
  /** Clock-in to clock-out, summed over closed days. */
  workedMinutes: number;
  /** Days they clocked in and never clocked out. */
  openShifts: number;
}

/**
 * One bar per person, weakest first.
 *
 * Weakest first on purpose: a league table sorted by the best puts the person
 * who needs a word at the bottom of the screen, which is the one place a
 * manager scrolling between customers will not look.
 */
export function personBars(
  rows: readonly EmployeePerformance[],
  logs: readonly AttendanceLog[] = [],
): PersonBar[] {
  // Hours come from the logs rather than the month's summary: the summary
  // predates clock-out and has nowhere to carry them.
  const hours = new Map<string, { worked: number; open: number }>();
  for (const log of logs) {
    const key = log.name.trim().toLowerCase();
    if (key === '') continue;
    const entry = hours.get(key) ?? { worked: 0, open: 0 };
    const worked = workedMinutesOf(log);
    if (worked === null) entry.open += 1;
    else entry.worked += worked;
    hours.set(key, entry);
  }

  return rows
    .map((row) => {
      const arrivals = row.onTime + row.late;
      const clock = hours.get(row.name.trim().toLowerCase()) ?? { worked: 0, open: 0 };
      return {
        workedMinutes: clock.worked,
        openShifts: clock.open,
        name: row.name,
        onTime: row.onTime,
        late: row.late,
        score: row.score,
        maxScore: row.maxScore,
        ratio: row.maxScore > 0 ? Math.min(1, row.score / row.maxScore) : 0,
        punctuality: arrivals > 0 ? row.onTime / arrivals : null,
      };
    })
    .sort((a, b) => a.ratio - b.ratio);
}
