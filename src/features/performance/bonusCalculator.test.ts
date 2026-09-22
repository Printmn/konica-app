import { describe, expect, it } from 'vitest';

import { MAX_MONTHLY_BONUS } from '@/constants/config';
import type { AttendanceLog, Employee, HabitTask } from '@/types';

import {
  calculateMonthlyRevenue,
  calculatePerformance,
  dailyMaxScore,
  workingDaysFor,
} from './bonusCalculator';


const tasks: HabitTask[] = [
  { id: 4, text: 'Цагтаа ирэх', done: false, type: 'habit', score: 3 },
  { id: 5, text: 'Цагтаа тарах', done: false, type: 'habit', score: 2 },
];

const attendance = (over: Partial<AttendanceLog>): AttendanceLog =>
  ({
    id: Math.random(),
    name: 'Болд',
    time: '10:00',
    status: 'Цагтаа ирсэн',
    penalty: 0,
    isLate: false,
    checked: true,
    date: '2026-08-04',
    month: '2026-08',
    completedTasks: [4, 5],
    completedTaskCount: 2,
    totalTaskCount: 2,
    completedScore: 5,
    totalPossibleScore: 5,
    ...over,
  });

describe('workingDaysFor', () => {
  it('counts every day when nobody rests', () => {
    expect(workingDaysFor('2026-08', [])).toBe(31);
  });

  it('subtracts the employee’s rest weekdays', () => {
    // August 2026 has five Sundays.
    expect(workingDaysFor('2026-08', [0])).toBe(31 - 5);
  });

  it('handles February', () => {
    expect(workingDaysFor('2026-02', [])).toBe(28);
  });
});

describe('calculatePerformance', () => {
  const employees: Employee[] = [
    { id: 1, name: 'Болд', pin: '1111', restDays: [0] },
  ];

  it('aggregates a month of logs per person', () => {
    const result = calculatePerformance({
      month: '2026-08',
      attendanceLogs: [
        attendance({ completedScore: 5 }),
        attendance({ completedScore: 3, isLate: true, date: '2026-08-05' }),
      ],
      employees,
      tasks,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ days: 2, onTime: 1, late: 1, score: 8 });
  });

  it('ignores logs from another month', () => {
    const result = calculatePerformance({
      month: '2026-08',
      attendanceLogs: [attendance({ month: '2026-07' })],
      employees,
      tasks,
    });
    expect(result).toHaveLength(0);
  });

  it('caps the bonus at 100% however many points were earned', () => {
    const logs = Array.from({ length: 40 }, (_, i) =>
      attendance({ completedScore: 100, date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    const result = calculatePerformance({
      month: '2026-08',
      attendanceLogs: logs,
      employees,
      tasks,
    });
    expect(result[0]?.pct).toBe(1);
    expect(result[0]?.bonus).toBe(MAX_MONTHLY_BONUS);
  });

  it('pays nothing when no habit scores exist to divide by', () => {
    const result = calculatePerformance({
      month: '2026-08',
      attendanceLogs: [attendance({})],
      employees,
      tasks: [],
    });
    expect(result[0]?.maxScore).toBe(0);
    expect(result[0]?.bonus).toBe(0);
  });

  it('ranks by score, highest first', () => {
    const result = calculatePerformance({
      month: '2026-08',
      attendanceLogs: [
        attendance({ name: 'Болд', completedScore: 3 }),
        attendance({ name: 'Сараа', completedScore: 9 }),
      ],
      employees,
      tasks,
    });
    expect(result.map((entry) => entry.name)).toEqual(['Сараа', 'Болд']);
  });
});

describe('calculateMonthlyRevenue', () => {
  it('sums the raw price, deliberately without VAT', () => {
    const revenue = calculateMonthlyRevenue('2026-08', [
      { price: '10000', payType: 'Бэлэн', date: '2026-08-01', hasVat: true },
      { price: '5000', payType: 'Данс', date: '2026-08-02', hasVat: false },
      { price: '9999', payType: 'Бэлэн', date: '2026-07-31', hasVat: false },
    ] as never);

    expect(revenue.totalRevenue).toBe(15000);
    expect(revenue.orderCount).toBe(2);
    expect(revenue.revenueByType).toEqual({ Бэлэн: 10000, Данс: 5000 });
  });
});

describe('dailyMaxScore', () => {
  it('is the sum of every habit score', () => {
    expect(dailyMaxScore(tasks)).toBe(5);
  });

  it('counts a habit with no score as one point', () => {
    expect(dailyMaxScore([{ id: 1, text: 'x', done: false, type: 'habit' } as HabitTask])).toBe(1);
  });
});

describe('the bonus ceiling is the manager\'s to set', () => {
  const base = {
    month: '2026-08',
    employees: [{ id: 1, name: 'Болд', pin: '1234', restDays: [] }] as never,
    tasks: [{ id: 1, text: 'Цагтаа ирэх', done: false, type: 'habit', score: 5 }] as never,
    attendanceLogs: [
      {
        id: 1,
        name: 'Болд',
        date: '2026-08-01',
        month: '2026-08',
        time: '10:00',
        isLate: false,
        completedScore: 5,
        completedTaskCount: 1,
        totalTaskCount: 1,
      },
    ] as never,
  };

  it('falls back to the compiled default when nothing is set', () => {
    const [entry] = calculatePerformance(base);
    expect(entry?.bonus).toBe(Math.round((entry?.pct ?? 0) * 100_000));
  });

  it('scales to whatever figure the manager entered', () => {
    const [entry] = calculatePerformance({ ...base, maxBonus: 250_000 });
    expect(entry?.bonus).toBe(Math.round((entry?.pct ?? 0) * 250_000));
  });

  it('ignores a zero or negative ceiling rather than paying nothing', () => {
    // A cleared field must not silently zero everybody's bonus.
    const [zero] = calculatePerformance({ ...base, maxBonus: 0 });
    const [negative] = calculatePerformance({ ...base, maxBonus: -5 });
    const [fallback] = calculatePerformance(base);
    expect(zero?.bonus).toBe(fallback?.bonus);
    expect(negative?.bonus).toBe(fallback?.bonus);
  });
});
