import { describe, expect, it } from 'vitest';

import { ARRIVE_TASK_ID } from '@/constants/config';
import type { HabitTask, TimeSettings } from '@/types';

import {
  registerArrival,
  scoreForTasks,
  totalPossibleScore,
  validateArrival,
} from './attendanceLogic';

const tasks: HabitTask[] = [
  { id: ARRIVE_TASK_ID, text: 'Цагтаа ирэх', done: false, type: 'habit', score: 3 },
  { id: 5, text: 'Цагтаа тарах', done: false, type: 'habit', score: 2 },
  { id: 6, text: 'Цэвэрлэгээ', done: false, type: 'cleaning', score: 1 },
];

const settings: TimeSettings = {
  startTime: '10:00',
  penaltyPerMin: 500,
  onTimeScore: 5,
  onLeaveScore: 3,
  workingDays: 22,
};

const now = new Date(2026, 7, 4, 10, 0);

describe('scoring', () => {
  it('adds up every habit score', () => {
    expect(totalPossibleScore(tasks)).toBe(6);
  });

  it('scores only the ticked habits', () => {
    expect(scoreForTasks([5, 6], tasks)).toBe(3);
  });

  it('treats an unknown id as worth nothing', () => {
    expect(scoreForTasks([999], tasks)).toBe(0);
  });
});

describe('registerArrival', () => {
  it('compares minutes, not strings — 09:45 beats a 10:00 start', () => {
    const { isLate, log } = registerArrival({
      name: 'Болд',
      arrivalTime: '09:45',
      doneTaskIds: [],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(isLate).toBe(false);
    expect(log.status).toBe('Цагтаа ирсэн');
  });

  it('counts the exact minutes late', () => {
    const { isLate, log } = registerArrival({
      name: 'Болд',
      arrivalTime: '10:17',
      doneTaskIds: [],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(isLate).toBe(true);
    expect(log.status).toBe('17 мин хоцорсон');
  });

  it('is not late exactly on the start time', () => {
    const { isLate } = registerArrival({
      name: 'Болд',
      arrivalTime: '10:00',
      doneTaskIds: [],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(isLate).toBe(false);
  });

  it('auto-ticks the arrival habit when on time', () => {
    const { log, nextDoneTaskIds } = registerArrival({
      name: 'Болд',
      arrivalTime: '09:50',
      doneTaskIds: [],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(log.completedTasks).toContain(ARRIVE_TASK_ID);
    expect(log.completedScore).toBe(3);
    expect(nextDoneTaskIds).toEqual([ARRIVE_TASK_ID]);
  });

  it('does not double-count an arrival habit already ticked', () => {
    const { log } = registerArrival({
      name: 'Болд',
      arrivalTime: '09:50',
      doneTaskIds: [ARRIVE_TASK_ID],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(log.completedTasks).toEqual([ARRIVE_TASK_ID]);
    expect(log.completedScore).toBe(3);
  });

  it('withholds the arrival habit from a late worker', () => {
    const { log, nextDoneTaskIds } = registerArrival({
      name: 'Болд',
      arrivalTime: '10:30',
      doneTaskIds: [6],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(log.completedTasks).not.toContain(ARRIVE_TASK_ID);
    expect(log.completedScore).toBe(1);
    expect(nextDoneTaskIds).toEqual([]);
  });

  it('stamps the local day and month', () => {
    const { log } = registerArrival({
      name: 'Болд',
      arrivalTime: '10:00',
      doneTaskIds: [],
      tasks,
      timeSettings: settings,
      now,
    });
    expect(log.date).toBe('2026-08-04');
    expect(log.month).toBe('2026-08');
  });
});

describe('validateArrival', () => {
  it('accepts a well-formed entry', () => {
    expect(validateArrival('Болд', '10:00')).toBeNull();
    expect(validateArrival('Болд', '9:05')).toBeNull();
  });

  it('rejects a missing name or time', () => {
    expect(validateArrival('  ', '10:00')).not.toBeNull();
    expect(validateArrival('Болд', '')).not.toBeNull();
  });

  it('rejects a malformed clock time', () => {
    expect(validateArrival('Болд', '10.00')).not.toBeNull();
    expect(validateArrival('Болд', 'өглөө')).not.toBeNull();
  });
});
