import { MAX_MONTHLY_BONUS } from '@/constants/config';
import type {
  AttendanceLog,
  Employee,
  EmployeePerformance,
  HabitTask,
  MonthlyRevenue,
  WorkLog,
} from '@/types';
import { daysInMonth } from '@/utils/date';

/**
 * Monthly performance and bonus.
 *
 * This is the most consequential calculation in the app — it decides what
 * people are paid — so it is reproduced exactly as the web build had it and
 * isolated here with no UI or I/O around it.
 *
 * The chain is:
 *   dailyMax   = Σ habit scores
 *   workDays   = calendar days in the month minus that employee's rest weekdays
 *   maxScore   = workDays × dailyMax
 *   pct        = min(earnedScore / maxScore, 1)      ← capped at 100%
 *   bonus      = round(pct × 100,000)
 */

/** Maximum habit score obtainable in a single day. */
export const dailyMaxScore = (tasks: readonly HabitTask[]): number =>
  tasks.reduce((sum, task) => sum + (task.score || 1), 0);

/**
 * Working days for one employee in a month.
 * `restDays` holds JS weekday indices (0 = Sunday); every other day counts.
 */
export const workingDaysFor = (month: string, restDays: readonly number[]): number => {
  const [yearRaw, monthRaw] = month.split('-').map(Number);
  const year = yearRaw ?? new Date().getFullYear();
  const monthIndex = (monthRaw ?? 1) - 1;
  const total = daysInMonth(month);

  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const weekday = new Date(year, monthIndex, day).getDay();
    if (!restDays.includes(weekday)) count += 1;
  }
  return count;
};

export interface PerformanceInput {
  month: string; // YYYY-MM
  attendanceLogs: readonly AttendanceLog[];
  employees: readonly Employee[];
  tasks: readonly HabitTask[];
  /**
   * What a perfect month pays, in tögrög.
   *
   * The shop used to be stuck with the figure compiled into the app. It is the
   * one number in this calculation the manager has an opinion about, so it is
   * now theirs to set — and an unset or nonsensical value falls back to the
   * old constant rather than paying nothing.
   */
  maxBonus?: number;
}

/**
 * Aggregates one month of attendance into a ranked leaderboard.
 * Sorted by earned score, descending — the medal order on screen.
 */
export function calculatePerformance(input: PerformanceInput): EmployeePerformance[] {
  const { month, attendanceLogs, employees, tasks } = input;
  const ceiling =
    typeof input.maxBonus === 'number' && input.maxBonus > 0
      ? input.maxBonus
      : MAX_MONTHLY_BONUS;
  const dailyMax = dailyMaxScore(tasks);
  const monthLogs = attendanceLogs.filter((log) => log.month === month);

  const byName = new Map<string, EmployeePerformance>();

  for (const log of monthLogs) {
    let entry = byName.get(log.name);
    if (!entry) {
      const record = employees.find((employee) => employee.name === log.name);
      const restDays = record?.restDays ?? [];
      entry = {
        name: log.name,
        days: 0,
        onTime: 0,
        late: 0,
        tasksDone: 0,
        tasksTotal: 0,
        completedScore: 0,
        workDays: workingDaysFor(month, restDays),
        restDays,
        score: 0,
        maxScore: 0,
        pct: 0,
        bonus: 0,
      };
      byName.set(log.name, entry);
    }

    entry.days += 1;
    if (log.isLate) entry.late += 1;
    else entry.onTime += 1;
    entry.tasksDone += log.completedTaskCount || 0;
    entry.tasksTotal += log.totalTaskCount || 0;
    entry.completedScore += log.completedScore || 0;
  }

  return [...byName.values()]
    .map((entry) => {
      const score = entry.completedScore;
      const maxScore = entry.workDays * dailyMax;
      const pct = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
      return {
        ...entry,
        score,
        maxScore,
        pct,
        bonus: Math.round(pct * ceiling),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Monthly revenue straight off the work logs.
 *
 * Note this uses the raw `price` field, *not* the VAT-adjusted figure — the
 * daily report applies VAT, the monthly summary does not. That asymmetry
 * existed in the original and is intentionally kept.
 */
export function calculateMonthlyRevenue(
  month: string,
  workLogs: readonly WorkLog[],
): MonthlyRevenue {
  const monthLogs = workLogs.filter((log) => log.date && log.date.startsWith(month));

  const revenueByType: Record<string, number> = {};
  let totalRevenue = 0;

  for (const log of monthLogs) {
    const amount = Number(log.price) || 0;
    totalRevenue += amount;
    const type = log.payType || 'Бусад';
    revenueByType[type] = (revenueByType[type] ?? 0) + amount;
  }

  return { totalRevenue, revenueByType, orderCount: monthLogs.length };
}
