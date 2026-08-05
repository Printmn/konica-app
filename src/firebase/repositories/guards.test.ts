import { describe, expect, it } from 'vitest';

import {
  CALC_TYPES_DEFAULT,
  COLOR_LABELS_DEFAULT,
  INVENTORY_DEFAULT,
  SERVICES_DEFAULT,
  TASKS_DEFAULT,
} from '@/constants/catalogDefaults';

import {
  isAttendanceLog,
  isEmployee,
  isHabitTask,
  isInventoryItem,
  isOrder,
  isServiceItem,
  isSimpleRecord,
  isWorkLog,
} from './guards';

/**
 * The guards decide what the app is allowed to see. A guard that is too strict
 * silently empties a screen, so the first and most important thing to prove is
 * that every row the app already ships with still passes.
 */
describe('the shipped seed data still validates', () => {
  it('accepts all 40 inventory items', () => {
    expect(INVENTORY_DEFAULT.every(isInventoryItem)).toBe(true);
    expect(INVENTORY_DEFAULT.length).toBeGreaterThan(0);
  });

  it('accepts all 83 services', () => {
    expect(SERVICES_DEFAULT.every(isServiceItem)).toBe(true);
    expect(SERVICES_DEFAULT.length).toBeGreaterThan(0);
  });

  it('accepts every habit', () => {
    expect(TASKS_DEFAULT.every(isHabitTask)).toBe(true);
  });

  it('accepts the colour labels and calculator types', () => {
    expect(COLOR_LABELS_DEFAULT.every(isSimpleRecord)).toBe(true);
    expect(CALC_TYPES_DEFAULT.every(isSimpleRecord)).toBe(true);
  });
});

describe('legacy rows from the web build are not thrown away', () => {
  it('keeps a work log whose price arrived as a number', () => {
    expect(isWorkLog({ id: 1, job: 'Хэвлэл', price: 8500 })).toBe(true);
  });

  it('keeps a work log with almost every optional field missing', () => {
    expect(isWorkLog({ id: 1 })).toBe(true);
  });

  it('keeps an item whose stock is a string, as the shop stores it', () => {
    expect(isInventoryItem({ id: 1, name: 'Цаас', price: '500₮', stock: '12' })).toBe(true);
  });

  it('keeps a null image rather than demanding a string', () => {
    expect(isServiceItem({ id: 1, name: 'Хэвлэл', price: '500₮', image: null })).toBe(true);
  });

  it('keeps an employee with no restDays field at all', () => {
    expect(isEmployee({ id: 1, name: 'Болд', pin: '1234' })).toBe(true);
  });

  it('keeps an employee with no PIN rather than erasing their history', () => {
    expect(isEmployee({ id: 1, name: 'Болд' })).toBe(true);
  });
});

describe('genuinely broken rows are rejected', () => {
  it('rejects a missing or unusable id', () => {
    expect(isWorkLog({ job: 'Хэвлэл' })).toBe(false);
    expect(isWorkLog({ id: '5', job: 'Хэвлэл' })).toBe(false);
    expect(isWorkLog({ id: Number.NaN })).toBe(false);
    expect(isWorkLog({ id: -1 })).toBe(false);
  });

  it('rejects a nameless catalog row, which would render as a blank line', () => {
    expect(isInventoryItem({ id: 1, price: '500₮' })).toBe(false);
    expect(isInventoryItem({ id: 1, name: '   ' })).toBe(false);
    expect(isServiceItem({ id: 1, name: 42 })).toBe(false);
  });

  it('rejects an employee whose PIN is the wrong type', () => {
    expect(isEmployee({ id: 1, name: 'Болд', pin: 1234 })).toBe(false);
  });

  it('rejects restDays that are not numbers', () => {
    expect(isEmployee({ id: 1, name: 'Болд', pin: '1234', restDays: ['Мя'] })).toBe(false);
  });

  it('rejects a boolean field that arrived as a string', () => {
    expect(isWorkLog({ id: 1, hasVat: 'yes' })).toBe(false);
  });

  it('rejects scalars and arrays outright', () => {
    for (const guard of [isOrder, isWorkLog, isEmployee, isInventoryItem, isHabitTask]) {
      expect(guard(null)).toBe(false);
      expect(guard(undefined)).toBe(false);
      expect(guard('nonsense')).toBe(false);
      expect(guard(42)).toBe(false);
      expect(guard([])).toBe(false);
    }
  });
});

describe('the website’s order shape', () => {
  const webOrder = {
    createdAt: '2026-05-24T12:06:26.233Z',
    name: 'Болд',
    phone: '99001122',
    service: 'Нэрийн хуудас',
    source: 'web',
    status: 'new',
  };

  it('is not recognised as one of the app’s orders', () => {
    // Which is the point: the repository leaves unrecognised rows untouched on
    // the server rather than deleting them.
    expect(isOrder(webOrder)).toBe(false);
  });

  it('does not stop the app’s own orders validating', () => {
    expect(isOrder({ id: 1, desc: 'Хэвлэл', price: 8500, paymentType: 'Бэлэн' })).toBe(true);
  });
});

describe('attendance', () => {
  it('accepts a normal log', () => {
    expect(
      isAttendanceLog({ id: 1, name: 'Болд', date: '2026-08-04', month: '2026-08', isLate: false }),
    ).toBe(true);
  });

  it('rejects one with no name, which the monthly report groups by', () => {
    expect(isAttendanceLog({ id: 1, date: '2026-08-04' })).toBe(false);
  });
});
