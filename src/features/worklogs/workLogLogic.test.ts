import { describe, expect, it } from 'vitest';

import type { PickableProduct, WorkLog, WorkLogForm } from '@/types';

import {
  applyProduct,
  applyQuantity,
  applyUnitPrice,
  applyWorkLogEdit,
  createWorkLog,
  emptyWorkLogForm,
  visibleWorkLogs,
  workLogToForm,
} from './workLogLogic';

const log = (over: Partial<WorkLog>): WorkLog =>
  ({ id: 1, date: '2026-08-04', job: 'Хэвлэл', status: '', ...over }) as WorkLog;

const product: PickableProduct = {
  id: 's-1',
  name: 'Нэрийн хуудас',
  price: 8500,
  category: 'Хэвлэл',
  type: 'service',
};

describe('applyProduct', () => {
  it('fills in a quantity of one when the box was left blank', () => {
    // It used to price the job as one unit while leaving the box empty, so the
    // next keystroke there recomputed the total and the price appeared to move
    // on its own.
    const next = applyProduct({ ...emptyWorkLogForm(), quantity: '' }, product);
    expect(next.quantity).toBe(1);
    expect(next.price).toBe('8500');
  });

  it('keeps a quantity the clerk already entered', () => {
    const next = applyProduct({ ...emptyWorkLogForm(), quantity: 3 }, product);
    expect(next.quantity).toBe(3);
    expect(next.price).toBe('25500');
  });
});

describe('quantity and price stay coupled', () => {
  const form: WorkLogForm = { ...emptyWorkLogForm(), unitPrice: '8500', quantity: 2 };

  it('recomputes the total from the quantity', () => {
    expect(applyQuantity(form, '4').price).toBe('34000');
  });

  it('clears the total when the quantity is cleared', () => {
    const cleared = applyQuantity(form, '');
    expect(cleared.quantity).toBe('');
    expect(cleared.price).toBe('');
  });

  it('never accepts less than one', () => {
    expect(applyQuantity(form, '0').quantity).toBe(1);
  });

  it('recomputes the total from the unit price', () => {
    expect(applyUnitPrice(form, '10000').price).toBe('20000');
  });
});

describe('createWorkLog', () => {
  /** The form carries its own date; `today` is only the fallback. */
  const formOn = (date: string): WorkLogForm => ({ ...emptyWorkLogForm(), orderDate: date });

  it('files the job under the form’s own date, not the fallback', () => {
    expect(createWorkLog(formOn('2026-08-03'), [], '2026-08-04').date).toBe('2026-08-03');
  });

  it('falls back to today when the form carries no date', () => {
    const undated: WorkLogForm = { ...emptyWorkLogForm(), orderDate: '' };
    expect(createWorkLog(undated, [], '2026-08-04').date).toBe('2026-08-04');
  });

  it('numbers the first job of the day 1', () => {
    expect(createWorkLog(formOn('2026-08-04'), [], '2026-08-04').no).toBe(1);
  });

  it('continues the day’s sequence', () => {
    const existing = [log({ no: 1 }), log({ id: 2, no: 2 })];
    expect(createWorkLog(formOn('2026-08-04'), existing, '2026-08-04').no).toBe(3);
  });

  it('does not reuse a number after a job is deleted', () => {
    // Counting rows gave 3 again here, so two jobs shared the number.
    const afterDelete = [log({ no: 1 }), log({ id: 3, no: 3 })];
    expect(createWorkLog(formOn('2026-08-04'), afterDelete, '2026-08-04').no).toBe(4);
  });

  it('starts again at 1 the next day', () => {
    const yesterday = [log({ date: '2026-08-03', no: 7 })];
    expect(createWorkLog(formOn('2026-08-04'), yesterday, '2026-08-04').no).toBe(1);
  });

  it('gives every log a distinct id', () => {
    const ids = Array.from(
      { length: 200 },
      () => createWorkLog(formOn('2026-08-04'), [], '2026-08-04').id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * Correcting a booked job must not create a second one. The identity that has
 * to survive is the id (everything downstream keys on it), the date (or the job
 * jumps off the board it was edited from) and the day's number (which is
 * printed on the export).
 */
describe('editing a booked job', () => {
  const booked = log({
    id: 42,
    no: 3,
    date: '2026-08-03',
    job: 'Нэрийн хуудас',
    price: '8500',
    note: 'яаралтай',
  });

  it('loads the job back into the form', () => {
    const form = workLogToForm(booked);
    expect(form.job).toBe('Нэрийн хуудас');
    expect(form.note).toBe('яаралтай');
    expect('id' in form).toBe(false);
    expect('no' in form).toBe(false);
  });

  it('files the form under the day the job was actually booked', () => {
    // The stored `orderDate` is missing on older rows, and today's date would
    // move a job booked yesterday onto today's board.
    expect(workLogToForm(booked).orderDate).toBe('2026-08-03');
  });

  it('keeps the id, date and day number when saving', () => {
    const edited = applyWorkLogEdit(booked, { ...workLogToForm(booked), price: '9000' });
    expect(edited.id).toBe(42);
    expect(edited.date).toBe('2026-08-03');
    expect(edited.no).toBe(3);
    expect(edited.price).toBe('9000');
  });

  it('round-trips a job unchanged when nothing is edited', () => {
    // `orderDate` is the one addition: older rows were stored without it, and
    // opening one in the form fills it in from the row's real date.
    expect(applyWorkLogEdit(booked, workLogToForm(booked))).toEqual({
      ...booked,
      orderDate: '2026-08-03',
    });
  });

  it('cannot be talked into changing the date through the form', () => {
    const moved = applyWorkLogEdit(booked, {
      ...workLogToForm(booked),
      orderDate: '2026-08-04',
    });
    expect(moved.date).toBe('2026-08-03');
  });
});

describe('visibleWorkLogs', () => {
  const logs = [
    log({ id: 1, date: '2026-08-04' }),
    log({ id: 2, date: '2026-08-03', status: 'Болсон' }),
    log({ id: 3, date: '2026-08-03', status: '' }),
  ];

  it('carries yesterday’s unfinished work onto today’s board', () => {
    expect(visibleWorkLogs(logs, null, '2026-08-04').map((l) => l.id)).toEqual([1, 3]);
  });

  it('shows exactly one day when an archive date is chosen', () => {
    expect(visibleWorkLogs(logs, '2026-08-03', '2026-08-04').map((l) => l.id)).toEqual([2, 3]);
  });
});
