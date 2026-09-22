import { ARRIVE_TASK_ID } from '@/constants/config';
import type { AttendanceLog, HabitTask, TimeSettings } from '@/types';
import { nextId } from '@/utils/id';
import { timeToMinutes, toDateString, toMonthString } from '@/utils/date';

import { describeDeparture, isEarlyArrival, startMinutesOf } from './clockInReminders';

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
  // Through `startMinutesOf`, not `timeToMinutes`: a blank setting parses as
  // midnight, which would file every arrival as «607 мин хоцорсон» and dock
  // the whole shop's score on the day somebody cleared the field.
  const startMinutes = startMinutesOf(timeSettings.startTime);

  let statusMsg = 'Цагтаа ирсэн';
  let isLate = false;
  if (arrivalMinutes > startMinutes) {
    isLate = true;
    statusMsg = `${arrivalMinutes - startMinutes} мин хоцорсон`;
  } else if (isEarlyArrival(arrivalMinutes, startMinutes)) {
    // Counted as on time and scored in full — this costs nobody a point. It is
    // said out loud because a 06:00 clock-in on a ten o'clock shift is a phone
    // tapped at home rather than somebody at the counter, and the manager
    // should be able to tell the two apart.
    statusMsg = `Цагтаа ирсэн · ${startMinutes - arrivalMinutes} мин эрт`;
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

/**
 * Stamps the departure onto a day's arrival row.
 *
 * Onto the arrival rather than as a second record: a person has one day, and
 * two rows would need pairing up every time anybody asked how long somebody
 * worked. Returns a fresh array so the caller's state update stays pure.
 *
 * Clocking out twice is a no-op on the second attempt. The first time is the
 * one that is true — somebody reopening the app at nine to check the chat has
 * not worked another half-hour.
 */
export interface DepartureResult {
  logs: AttendanceLog[];
  /** The row that changed, or `null` when there was nothing to stamp. */
  updated: AttendanceLog | null;
  /** Why nothing happened, for the message shown. */
  reason: string | null;
}

export function registerDeparture(
  logs: readonly AttendanceLog[],
  name: string,
  date: string,
  leaveTime: string,
  timeSettings: TimeSettings,
): DepartureResult {
  const who = name.trim().toLowerCase();
  if (who === '') return { logs: [...logs], updated: null, reason: 'Нэр тодорхойгүй байна.' };

  const index = logs.findIndex(
    (log) => log.date === date && log.name.trim().toLowerCase() === who,
  );
  if (index === -1) {
    return { logs: [...logs], updated: null, reason: 'Эхлээд ирснээ бүртгүүлнэ үү.' };
  }

  const existing = logs[index];
  if (existing === undefined) {
    return { logs: [...logs], updated: null, reason: 'Эхлээд ирснээ бүртгүүлнэ үү.' };
  }
  if (existing.leaveTime) {
    return { logs: [...logs], updated: null, reason: `Аль хэдийн ${existing.leaveTime}-д бүртгэгдсэн.` };
  }

  const departure = describeDeparture(
    timeToMinutes(leaveTime),
    timeToMinutes(existing.time),
    timeSettings.endTime,
  );

  const updated: AttendanceLog = {
    ...existing,
    leaveTime,
    leaveStatus: departure.status,
    leftEarly: departure.early,
  };

  const next = [...logs];
  next[index] = updated;
  return { logs: next, updated, reason: null };
}

/** Validation used by the screen before calling `registerArrival`. */
export const validateArrival = (name: string, time: string): string | null => {
  if (!name.trim()) return 'Нэр болон цагаа оруулна уу!';
  if (!time.trim()) return 'Нэр болон цагаа оруулна уу!';
  if (!/^\d{1,2}:\d{2}$/.test(time)) return 'Цагийг ЦЦ:ММ хэлбэрээр оруулна уу.';
  return null;
};
