import { ARRIVE_TASK_ID } from '@/constants/config';
import type { AttendanceLog, HabitTask, TimeSettings } from '@/types';
import { nextId } from '@/utils/id';
import { toDateString, toMonthString, timeToMinutes } from '@/utils/date';

/**
 * Attendance registration.
 *
 * Ported one-for-one from `handleRegisterTime` in the web build. Two rules are
 * load-bearing and easy to get wrong, so they are stated explicitly:
 *
 *  1. Lateness is a *minute* comparison against `timeSettings.startTime`,
 *     not a string compare.
 *  2. Arriving on time auto-completes the habit with `id === 4`
 *     ("Цагтаа ирэх") — but only if the worker had not already ticked it.
 */

export interface RegisterArrivalInput {
  name: string;
  arrivalTime: string; // HH:mm
  doneTaskIds: readonly number[];
  tasks: readonly HabitTask[];
  timeSettings: TimeSettings;
  now?: Date;
}

export interface RegisterArrivalResult {
  log: AttendanceLog;
  /** Habit ids that should appear ticked after registering. */
  nextDoneTaskIds: number[];
  isLate: boolean;
}

export const totalPossibleScore = (tasks: readonly HabitTask[]): number =>
  tasks.reduce((sum, task) => sum + (task.score || 1), 0);

export const scoreForTasks = (
  taskIds: readonly number[],
  tasks: readonly HabitTask[],
): number =>
  taskIds.reduce((sum, id) => {
    const task = tasks.find((t) => t.id === id);
    return sum + (task ? task.score || 1 : 0);
  }, 0);

export function registerArrival(input: RegisterArrivalInput): RegisterArrivalResult {
  const { name, arrivalTime, doneTaskIds, tasks, timeSettings, now = new Date() } = input;

  const arrivalMinutes = timeToMinutes(arrivalTime);
  const startMinutes = timeToMinutes(timeSettings.startTime);

  let statusMsg = 'Цагтаа ирсэн';
  let isLate = false;
  if (arrivalMinutes > startMinutes) {
    isLate = true;
    statusMsg = `${arrivalMinutes - startMinutes} мин хоцорсон`;
  }

  const finalDoneIds =
    !isLate && !doneTaskIds.includes(ARRIVE_TASK_ID)
      ? [...doneTaskIds, ARRIVE_TASK_ID]
      : [...doneTaskIds];

  const log: AttendanceLog = {
    id: nextId(),
    name,
    time: arrivalTime,
    status: statusMsg,
    // `penalty` stayed 0 in the web build even though a per-minute rate exists;
    // preserved so historical totals do not shift.
    penalty: 0,
    isLate,
    checked: !isLate,
    date: toDateString(now),
    month: toMonthString(now),
    completedTasks: finalDoneIds,
    completedTaskCount: finalDoneIds.length,
    totalTaskCount: tasks.length,
    completedScore: scoreForTasks(finalDoneIds, tasks),
    totalPossibleScore: totalPossibleScore(tasks),
  };

  return {
    log,
    nextDoneTaskIds: isLate ? [] : [ARRIVE_TASK_ID],
    isLate,
  };
}

/** Validation used by the screen before calling `registerArrival`. */
export const validateArrival = (name: string, time: string): string | null => {
  if (!name.trim()) return 'Нэр болон цагаа оруулна уу!';
  if (!time.trim()) return 'Нэр болон цагаа оруулна уу!';
  if (!/^\d{1,2}:\d{2}$/.test(time)) return 'Цагийг ЦЦ:ММ хэлбэрээр оруулна уу.';
  return null;
};
