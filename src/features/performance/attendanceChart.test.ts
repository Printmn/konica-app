import { describe, expect, it } from 'vitest';

import type { AttendanceLog, EmployeePerformance } from '@/types';

import { attendanceBars, chartTotals, personBars } from './attendanceChart';

const log = (over: Partial<AttendanceLog>): AttendanceLog =>
  ({
    id: 1,
    name: 'Бат',
    date: '2026-09-22',
    isLate: false,
    completedScore: 3,
    totalPossibleScore: 6,
    ...over,
  }) as AttendanceLog;

const person = (over: Partial<EmployeePerformance>): EmployeePerformance => ({
  name: 'Бат',
  days: 5,
  onTime: 5,
  late: 0,
  tasksDone: 0,
  tasksTotal: 0,
  completedScore: 0,
  workDays: 5,
  restDays: [],
  score: 20,
  maxScore: 30,
  pct: 0,
  bonus: 0,
  ...over,
});

describe('attendanceBars', () => {
  const today = '2026-09-22';

  it('draws one bar per day, oldest on the left', () => {
    const bars = attendanceBars([], { days: 3, today });
    expect(bars.map((bar) => bar.date)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
    expect(bars[2]?.isToday).toBe(true);
  });

  it('adds up arrivals and points per day', () => {
    const bars = attendanceBars(
      [
        log({ id: 1, date: today, completedScore: 6, totalPossibleScore: 6 }),
        log({ id: 2, date: today, isLate: true, completedScore: 2, totalPossibleScore: 6 }),
      ],
      { days: 1, today },
    );
    expect(bars[0]).toMatchObject({ onTime: 1, late: 1, score: 8, maxScore: 12 });
  });

  /**
   * Height is the day's score against *that day's* ceiling, not against the
   * busiest day in the window: two people on Monday and four on Tuesday means
   * a higher ceiling on Tuesday, and scaling to the tallest bar would make a
   * perfect Monday look like a bad one.
   */
  it('scales each day against its own ceiling', () => {
    const bars = attendanceBars(
      [
        log({ id: 1, date: '2026-09-21', completedScore: 6, totalPossibleScore: 6 }),
        log({ id: 2, date: today, completedScore: 6, totalPossibleScore: 6 }),
        log({ id: 3, date: today, completedScore: 6, totalPossibleScore: 6 }),
      ],
      { days: 2, today },
    );
    expect(bars[0]?.height).toBe(1);
    expect(bars[1]?.height).toBe(1);
  });

  it('draws a day nobody worked as empty, not as zero', () => {
    // Zero would read as «everybody failed»; the shop was shut.
    const bars = attendanceBars([], { days: 1, today });
    expect(bars[0]).toMatchObject({ height: 0, maxScore: 0 });
  });

  it('never exceeds full height on a day that over-scored', () => {
    const bars = attendanceBars(
      [log({ date: today, completedScore: 99, totalPossibleScore: 6 })],
      { days: 1, today },
    );
    expect(bars[0]?.height).toBe(1);
  });

  it('ignores rows with no date', () => {
    expect(attendanceBars([log({ date: '' })], { days: 1, today })[0]?.onTime).toBe(0);
  });
});

describe('chartTotals', () => {
  it('reports punctuality as a share of arrivals', () => {
    const bars = attendanceBars(
      [
        log({ id: 1, date: '2026-09-22' }),
        log({ id: 2, date: '2026-09-22' }),
        log({ id: 3, date: '2026-09-22', isLate: true }),
      ],
      { days: 1, today: '2026-09-22' },
    );
    expect(chartTotals(bars)).toMatchObject({ onTime: 2, late: 1 });
    expect(chartTotals(bars).punctuality).toBeCloseTo(2 / 3);
  });

  it('has no punctuality to report when nobody came in', () => {
    expect(chartTotals(attendanceBars([], { days: 7 })).punctuality).toBeNull();
  });
});

describe('personBars', () => {
  it('puts the weakest first', () => {
    // Sorting by the best puts the person who needs a word at the bottom of
    // the screen, which is where a manager between customers will not look.
    const rows = personBars([
      person({ name: 'Бат', score: 28, maxScore: 30 }),
      person({ name: 'Дорж', score: 9, maxScore: 30 }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(['Дорж', 'Бат']);
  });

  it('has no punctuality for somebody who never came in', () => {
    expect(personBars([person({ onTime: 0, late: 0 })])[0]?.punctuality).toBeNull();
  });

  it('does not divide by a zero ceiling', () => {
    expect(personBars([person({ score: 0, maxScore: 0 })])[0]?.ratio).toBe(0);
  });
});
