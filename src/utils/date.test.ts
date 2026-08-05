import { describe, expect, it } from 'vitest';

import { daysInMonth, shiftDate, weekdayOf } from './date';

/**
 * The calendar picker is built from these two functions: `weekdayOf` decides
 * how many blank squares start the grid, `shiftDate` powers the «+3 хоног»
 * chips. Both are computed from local-time parts on purpose — parsing the
 * string as UTC would put Mongolia a day behind for most of the working day.
 */
describe('shiftDate', () => {
  it('steps forward within a month', () => {
    expect(shiftDate('2026-08-04', 3)).toBe('2026-08-07');
  });

  it('rolls into the next month', () => {
    expect(shiftDate('2026-08-30', 3)).toBe('2026-09-02');
  });

  it('rolls into the next year', () => {
    expect(shiftDate('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('steps backwards', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows February has 29 days in a leap year', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('leaves an unreadable date alone', () => {
    expect(shiftDate('маргааш', 1)).toBe('маргааш');
  });
});

describe('weekdayOf', () => {
  it('places a known date on the right weekday', () => {
    // 2026-08-04 is a Tuesday; 0 is Sunday.
    expect(weekdayOf('2026-08-04')).toBe(2);
  });

  it('is Sunday for a Sunday', () => {
    expect(weekdayOf('2026-08-02')).toBe(0);
  });

  it('falls back to 0 rather than NaN on junk', () => {
    expect(weekdayOf('')).toBe(0);
  });
});

describe('daysInMonth', () => {
  it('counts a 31-day month', () => {
    expect(daysInMonth('2026-08')).toBe(31);
  });

  it('counts February in a leap year', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
  });
});
