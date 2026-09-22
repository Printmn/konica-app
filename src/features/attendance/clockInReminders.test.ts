import { describe, expect, it } from 'vitest';

import {
  DEFAULT_START,
  describeDeparture,
  hasClockedIn,
  pendingReminders,
  secondsUntil,
  startMinutesOf,
  workedLabel,
} from './clockInReminders';

describe('startMinutesOf', () => {
  it('reads a normal shift time', () => {
    expect(startMinutesOf('10:00')).toBe(600);
    expect(startMinutesOf(' 09:30 ')).toBe(570);
  });

  /**
   * `timeToMinutes('')` is 0, which reads as midnight. Left alone, a blank
   * setting filed every arrival as «607 мин хоцорсон» and scheduled three
   * reminders for the small hours.
   */
  it('falls back rather than reading a blank as midnight', () => {
    expect(startMinutesOf('')).toBe(600);
    expect(startMinutesOf('өглөө')).toBe(600);
    expect(startMinutesOf('00:00')).toBe(600);
    expect(DEFAULT_START).toBe('10:00');
  });
});

describe('pendingReminders', () => {
  it('fires half an hour out, then every ten minutes', () => {
    expect(pendingReminders('10:00', 480).map((r) => r.at)).toEqual(['09:30', '09:40', '09:50']);
  });

  it('drops the ones already past rather than firing them late', () => {
    // A phone unlocked at 09:45 should get the ten-minute warning and nothing
    // else, not a burst of three saying half an hour is left when it is not.
    expect(pendingReminders('10:00', 585).map((r) => r.lead)).toEqual([10]);
  });

  it('goes quiet once the shift has started', () => {
    expect(pendingReminders('10:00', 600)).toEqual([]);
    expect(pendingReminders('10:00', 620)).toEqual([]);
  });

  it('only the last one asks for the clock-in', () => {
    const [first, , last] = pendingReminders('10:00', 400);
    expect(first?.body).not.toContain('бүртгүүлээрэй');
    expect(last?.body).toContain('бүртгүүлээрэй');
  });

  it('follows a shift moved earlier', () => {
    expect(pendingReminders('09:00', 400).map((r) => r.at)).toEqual(['08:30', '08:40', '08:50']);
  });
});

describe('secondsUntil', () => {
  it('counts down to the minute, seconds included', () => {
    const [reminder] = pendingReminders('10:00', 560);
    expect(secondsUntil(reminder!, 560, 0)).toBe(600);
    expect(secondsUntil(reminder!, 560, 30)).toBe(570);
  });

  it('never schedules in the past', () => {
    expect(secondsUntil({ lead: 10, atMinutes: 500, at: '08:20', body: '' }, 600)).toBe(1);
  });
});

describe('hasClockedIn', () => {
  const logs = [
    { name: 'Бат', date: '2026-09-22' },
    { name: ' дорж ', date: '2026-09-21' },
  ];

  it('stops the nudges once they have registered today', () => {
    expect(hasClockedIn(logs, 'Бат', '2026-09-22')).toBe(true);
  });

  it('does not count yesterday’s arrival', () => {
    expect(hasClockedIn(logs, 'Дорж', '2026-09-22')).toBe(false);
  });

  it('is never true for an unnamed session', () => {
    expect(hasClockedIn(logs, '', '2026-09-22')).toBe(false);
  });
});

describe('describeDeparture', () => {
  const end = '18:30';
  const arrival = 10 * 60; // 10:00

  it('calls it on time at the hour and just before it', () => {
    expect(describeDeparture(18 * 60 + 30, arrival, end).early).toBe(false);
    // Packing up as the clock turns is not leaving early; flagging it would
    // make the figure meaningless within a week.
    expect(describeDeparture(18 * 60 + 26, arrival, end).early).toBe(false);
  });

  it('flags a real early finish, with the minutes', () => {
    const out = describeDeparture(18 * 60 + 5, arrival, end);
    expect(out.early).toBe(true);
    expect(out.status).toBe('25 мин эрт тарсан');
  });

  it('does not announce staying late', () => {
    // Hours past the end are the shop's gain; announcing them invites the kind
    // of competition a small team does not need.
    const out = describeDeparture(20 * 60, arrival, end);
    expect(out.early).toBe(false);
    expect(out.status).toBe('Цагтаа тарсан');
    expect(out.workedMinutes).toBe(600);
  });

  it('counts the span, not the shift', () => {
    expect(describeDeparture(18 * 60 + 35, 10 * 60 + 2, end).workedMinutes).toBe(513);
  });

  it('never goes negative on a nonsense pair', () => {
    expect(describeDeparture(9 * 60, 10 * 60, end).workedMinutes).toBe(0);
  });

  it('falls back to 18:30 when the shop has no end time', () => {
    expect(describeDeparture(18 * 60 + 30, arrival, undefined).early).toBe(false);
    expect(describeDeparture(17 * 60, arrival, '').early).toBe(true);
  });
});

describe('workedLabel', () => {
  it('reads the way somebody says it', () => {
    expect(workedLabel(513)).toBe('8ц 33м');
    expect(workedLabel(45)).toBe('45м');
    expect(workedLabel(120)).toBe('2ц 00м');
  });

  it('has nothing to say for a shift that has not happened', () => {
    expect(workedLabel(0)).toBe('—');
    expect(workedLabel(-5)).toBe('—');
  });
});
