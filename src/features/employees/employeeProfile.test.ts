import { describe, expect, it } from 'vitest';

import type { Employee } from '@/types';

import {
  applyProfile,
  emptyProfile,
  isBirthdayToday,
  longDate,
  missingFields,
  profileOf,
  tenureLabel,
  tenureMonths,
} from './employeeProfile';

const employee = (over: Partial<Employee>): Employee => ({
  id: 1,
  name: 'Болд',
  pin: '1234',
  restDays: [],
  ...over,
});

describe('tenureMonths', () => {
  it('counts completed months, not started ones', () => {
    // Started on the 30th: on the 29th of the next month that is not a month
    // yet, and a shop paying by length of service will be asked to defend it.
    expect(tenureMonths('2026-06-30', '2026-07-29')).toBe(0);
    expect(tenureMonths('2026-06-30', '2026-07-30')).toBe(1);
  });

  it('spans years', () => {
    expect(tenureMonths('2024-03-15', '2026-08-04')).toBe(28);
  });

  it('treats a future start date as nothing yet, rather than negative', () => {
    expect(tenureMonths('2027-01-01', '2026-08-04')).toBe(0);
  });

  it('gives nothing back for a missing or malformed date', () => {
    expect(tenureMonths(undefined, '2026-08-04')).toBeNull();
    expect(tenureMonths('', '2026-08-04')).toBeNull();
    expect(tenureMonths('2026-13-01', '2026-08-04')).toBeNull();
    // 31 February would silently roll into March if `Date` were trusted.
    expect(tenureMonths('2026-02-31', '2026-08-04')).toBeNull();
  });
});

describe('tenureLabel', () => {
  it('reads naturally in Mongolian', () => {
    expect(tenureLabel('2024-03-15', '2026-08-04')).toBe('2 жил 4 сар');
    expect(tenureLabel('2026-02-01', '2026-08-04')).toBe('6 сар');
    expect(tenureLabel('2025-08-04', '2026-08-04')).toBe('1 жил');
  });

  it('has something to say on the first day', () => {
    expect(tenureLabel('2026-08-01', '2026-08-04')).toBe('Энэ сар нэгдсэн');
  });

  it('says nothing when the date is unknown', () => {
    expect(tenureLabel(undefined, '2026-08-04')).toBe('');
  });
});

describe('isBirthdayToday', () => {
  it('ignores the year', () => {
    expect(isBirthdayToday('1994-08-04', '2026-08-04')).toBe(true);
    expect(isBirthdayToday('1994-08-05', '2026-08-04')).toBe(false);
  });

  it('is false rather than throwing on nothing', () => {
    expect(isBirthdayToday(undefined, '2026-08-04')).toBe(false);
    expect(isBirthdayToday('төрсөн', '2026-08-04')).toBe(false);
  });
});

describe('longDate', () => {
  it('spells out a date', () => {
    expect(longDate('2026-08-04')).toBe('2026 оны 8 сарын 4');
  });

  it('is empty for anything unreadable', () => {
    expect(longDate('')).toBe('');
    expect(longDate('04/08/2026')).toBe('');
  });
});

describe('profileOf and applyProfile', () => {
  it('reads a profile that was never filled in as blanks', () => {
    expect(profileOf(employee({}))).toEqual(emptyProfile());
  });

  it('writes only onto the person edited', () => {
    const roster = [employee({ id: 1 }), employee({ id: 2, name: 'Сараа' })];
    const next = applyProfile(roster, 2, { ...emptyProfile(), phone: '99112233' });
    expect(next[0]?.phone).toBeUndefined();
    expect(next[1]?.phone).toBe('99112233');
    expect(next[1]?.name).toBe('Сараа');
  });

  it('clears a field rather than leaving the old value behind', () => {
    const roster = [employee({ id: 1, phone: '99112233' })];
    const next = applyProfile(roster, 1, emptyProfile());
    expect(next[0]?.phone).toBe('');
  });
});

describe('missingFields', () => {
  it('names what still has to be filled in', () => {
    expect(missingFields(employee({}))).toEqual([
      'утас',
      'төрсөн өдөр',
      'яаралтай холбоо',
      'ажилд орсон огноо',
    ]);
  });

  it('is empty once the four that matter are there', () => {
    const complete = employee({
      phone: '99112233',
      birthDate: '1994-08-04',
      emergencyPhone: '88112233',
      startDate: '2024-03-15',
    });
    expect(missingFields(complete)).toEqual([]);
  });
});
