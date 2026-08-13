import { describe, expect, it } from 'vitest';

import type {
  InventoryItem,
  PickableProduct,
  ServiceItem,
  WorkLog,
  WorkLogForm,
} from '@/types';

import {
  applyProduct,
  applyQuantity,
  applyUnitPrice,
  applyWorkLogEdit,
  createWorkLog,
  dayLabel,
  deadlineLabel,
  groupWorkLogsByDate,
  intakeLabel,
  emptyWorkLogForm,
  imageForJob,
  productImageMap,
  quantityLabel,
  unitPriceOf,
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

/**
 * A work log stores its job as free text, so the only route back to the
 * product's photo is the name. Matching has to survive the difference between
 * a name picked from the catalog and one typed at the counter.
 */
describe('catalog photos on the board', () => {
  const service = (over: Partial<ServiceItem>): ServiceItem => ({
    id: 1,
    name: 'Нэрийн хуудас',
    price: '8500₮',
    category: 'Хэвлэл',
    image: 'data:image/jpeg;base64,SERVICE',
    ...over,
  });

  const stock = (over: Partial<InventoryItem>): InventoryItem => ({
    id: 1,
    name: 'Цаас',
    price: '500₮',
    stock: '10',
    category: 'Цаас',
    image: 'data:image/jpeg;base64,STOCK',
    ...over,
  });

  it('finds a photo for a job booked from the catalog', () => {
    const images = productImageMap([service({})], []);
    expect(imageForJob(images, 'Нэрийн хуудас')).toBe('data:image/jpeg;base64,SERVICE');
  });

  it('still matches a name typed with different case or stray spaces', () => {
    const images = productImageMap([service({})], []);
    expect(imageForJob(images, '  нэрийн ХУУДАС ')).toBe('data:image/jpeg;base64,SERVICE');
  });

  it('has nothing for a job that is not in the catalog', () => {
    expect(imageForJob(productImageMap([service({})], []), 'Тусгай захиалга')).toBeNull();
  });

  it('skips products with no photo rather than storing a blank', () => {
    const images = productImageMap([service({ image: null })], []);
    expect(imageForJob(images, 'Нэрийн хуудас')).toBeNull();
  });

  it('prefers a service over a stock item of the same name', () => {
    // A job on the board is something the shop made, not something on a shelf.
    const images = productImageMap([service({ name: 'Хавтас' })], [stock({ name: 'Хавтас' })]);
    expect(imageForJob(images, 'Хавтас')).toBe('data:image/jpeg;base64,SERVICE');
  });

  it('falls back to inventory when no service carries the name', () => {
    const images = productImageMap([], [stock({})]);
    expect(imageForJob(images, 'Цаас')).toBe('data:image/jpeg;base64,STOCK');
  });
});

/**
 * `price` on a work log is the line total. Handing it to an invoice as the
 * unit price multiplied the job by its quantity a second time — ten name cards
 * at ₮1,300 were billed as ten at ₮13,000.
 */
describe('unitPriceOf', () => {
  it('uses the stored unit price', () => {
    expect(unitPriceOf({ price: '13000', unitPrice: '1300', quantity: 10 })).toBe(1300);
  });

  it('divides the total back out when no unit price was stored', () => {
    // Rows booked before the field existed carry only a total.
    expect(unitPriceOf({ price: '13000', unitPrice: '', quantity: 10 })).toBe(1300);
  });

  it('is the total itself for a single item', () => {
    expect(unitPriceOf({ price: '8500', unitPrice: '', quantity: 1 })).toBe(8500);
    expect(unitPriceOf({ price: '8500', unitPrice: '', quantity: '' })).toBe(8500);
  });

  it('rounds a total that does not divide evenly', () => {
    expect(unitPriceOf({ price: '1000', unitPrice: '', quantity: 3 })).toBe(333);
  });

  it('ignores a zero or unreadable stored unit price', () => {
    expect(unitPriceOf({ price: '13000', unitPrice: '0', quantity: 10 })).toBe(1300);
    expect(unitPriceOf({ price: '13000', unitPrice: 'үнэгүй', quantity: 10 })).toBe(1300);
  });

  it('is zero for a job with no price at all', () => {
    expect(unitPriceOf({ price: '', unitPrice: '', quantity: 5 })).toBe(0);
  });
});

/**
 * «Маргааш» began as a flag and is now a chosen day, so a job can be due next
 * week. The word is only correct when no day was picked — the Excel export is
 * what the shop reconciles from, and it must not say "tomorrow" beside a date
 * seven days out.
 */
describe('deadlineLabel', () => {
  it('shows the chosen day and time', () => {
    expect(
      deadlineLabel({ deadline: '14:00', isTomorrow: true, tomorrowDate: '2026-08-12' }),
    ).toBe('08/12 14:00');
  });

  it('still says «Маргааш» when the flag is set without a day', () => {
    // Rows booked before the picker existed carry the flag and nothing else.
    expect(deadlineLabel({ deadline: '14:00', isTomorrow: true })).toBe('Маргааш 14:00');
    expect(deadlineLabel({ deadline: '14:00', isTomorrow: true, tomorrowDate: '' })).toBe(
      'Маргааш 14:00',
    );
  });

  it('is just the time for a job due the same day', () => {
    expect(deadlineLabel({ deadline: '16:30', isTomorrow: false })).toBe('16:30');
  });

  it('shows the day alone when no time was set', () => {
    expect(deadlineLabel({ deadline: '', isTomorrow: true, tomorrowDate: '2026-08-12' })).toBe(
      '08/12',
    );
  });

  it('is empty when there is no deadline at all', () => {
    expect(deadlineLabel({ deadline: '', isTomorrow: false })).toBe('');
  });

  it('ignores a stored date that is not a real one', () => {
    expect(
      deadlineLabel({ deadline: '09:00', isTomorrow: true, tomorrowDate: 'маргааш' }),
    ).toBe('Маргааш 09:00');
  });
});

describe('quantityLabel', () => {
  it('shows a count worth reading', () => {
    expect(quantityLabel({ quantity: 90 })).toBe('×90');
    expect(quantityLabel({ quantity: '250' })).toBe('×250');
  });

  it('says nothing for a single item, which is the default on every job', () => {
    expect(quantityLabel({ quantity: 1 })).toBe('');
    expect(quantityLabel({ quantity: '1' })).toBe('');
  });

  it('says nothing when the quantity is missing or unreadable', () => {
    expect(quantityLabel({ quantity: '' })).toBe('');
    expect(quantityLabel({ quantity: 'олон' })).toBe('');
    expect(quantityLabel({ quantity: 0 })).toBe('');
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
    expect(visibleWorkLogs(logs, '2026-08-03', '2026-08-04').map((l) => l.id)).toEqual([3, 2]);
  });
});

/**
 * A new job is prepended locally, so the board looks right until the next sync
 * — then Firebase hands the collection back in its own order and everything
 * reshuffles. Sorting on read is what keeps the two devices agreeing.
 */
describe('the board is cut into days', () => {
  it('names today, yesterday and tomorrow rather than dating them', () => {
    expect(dayLabel('2026-08-04', '2026-08-04')).toBe('ӨНӨӨДӨР');
    expect(dayLabel('2026-08-03', '2026-08-04')).toBe('ӨЧИГДӨР');
    expect(dayLabel('2026-08-05', '2026-08-04')).toBe('МАРГААШ');
  });

  it('dates anything older, in Mongolian', () => {
    expect(dayLabel('2026-08-01', '2026-08-04')).toBe('8-р сарын 1');
    expect(dayLabel('2025-12-25', '2026-08-04')).toBe('12-р сарын 25');
  });

  it('groups a mixed board without reordering it', () => {
    const board = [
      log({ id: 3, date: '2026-08-04' }),
      log({ id: 2, date: '2026-08-04' }),
      log({ id: 1, date: '2026-08-02' }),
    ];
    const groups = groupWorkLogsByDate(board, '2026-08-04');

    expect(groups.map((g) => g.label)).toEqual(['ӨНӨӨДӨР', '8-р сарын 2']);
    expect(groups.map((g) => g.logs.map((l) => l.id))).toEqual([[3, 2], [1]]);
  });

  it('marks carried-over days as overdue and today as not', () => {
    const groups = groupWorkLogsByDate(
      [log({ id: 2, date: '2026-08-04' }), log({ id: 1, date: '2026-08-02' })],
      '2026-08-04',
    );
    expect(groups.map((g) => g.overdue)).toEqual([false, true]);
  });

  it('stops calling an old day overdue once its work is finished', () => {
    // The archive shows a completed day in full, and marking the last job
    // «Болсон» has to take the warning off the heading — otherwise the heading
    // contradicts the card right underneath it.
    const groups = groupWorkLogsByDate(
      [
        log({ id: 3, date: '2026-08-02', status: 'Болсон' }),
        log({ id: 2, date: '2026-08-02', status: 'Болсон аваагүй' }),
      ],
      '2026-08-04',
    );
    expect(groups[0]?.pending).toBe(0);
    expect(groups[0]?.overdue).toBe(false);
  });

  it('counts only what is still outstanding on a part-finished day', () => {
    const groups = groupWorkLogsByDate(
      [
        log({ id: 3, date: '2026-08-02', status: 'Болсон' }),
        log({ id: 2, date: '2026-08-02', status: '' }),
        log({ id: 1, date: '2026-08-02', status: 'Тооцоотой' }),
      ],
      '2026-08-04',
    );
    expect(groups[0]?.logs).toHaveLength(3);
    expect(groups[0]?.pending).toBe(2);
    expect(groups[0]?.overdue).toBe(true);
  });

  it('gives an empty board no groups at all', () => {
    expect(groupWorkLogsByDate([], '2026-08-04')).toEqual([]);
  });
});

describe('intakeLabel', () => {
  it('shows just the clock for a job booked today', () => {
    expect(
      intakeLabel({ receivedTime: '14:30', date: '2026-08-04', id: 1 }, '2026-08-04'),
    ).toBe('14:30');
  });

  it('adds the day for work carried over from an earlier one', () => {
    expect(
      intakeLabel({ receivedTime: '14:30', date: '2026-08-02', id: 1 }, '2026-08-04'),
    ).toBe('08/02 14:30');
  });

  it('falls back to the id, which is when the row was created', () => {
    const bookedAt = new Date(2026, 7, 4, 9, 5).getTime();
    expect(intakeLabel({ receivedTime: '', date: '2026-08-04', id: bookedAt }, '2026-08-04')).toBe(
      '09:05',
    );
  });

  it('will not read a clock off an id from another day', () => {
    // Imported and repaired rows carry ids that have nothing to do with the
    // day they are filed under; inventing a time for those would be a lie.
    const elsewhere = new Date(2020, 0, 1, 3, 0).getTime();
    expect(intakeLabel({ receivedTime: '', date: '2026-08-04', id: elsewhere }, '2026-08-04')).toBe(
      '',
    );
  });

  it('shows the day alone when there is no usable time at all', () => {
    expect(intakeLabel({ receivedTime: '', date: '2026-08-02', id: 7 }, '2026-08-04')).toBe('08/02');
  });
});

describe('the board is ordered newest first', () => {
  it('puts the latest booking of the day at the top', () => {
    const day = [
      log({ id: 1, no: 1, date: '2026-08-04' }),
      log({ id: 2, no: 3, date: '2026-08-04' }),
      log({ id: 3, no: 2, date: '2026-08-04' }),
    ];
    expect(visibleWorkLogs(day, null, '2026-08-04').map((l) => l.no)).toEqual([3, 2, 1]);
  });

  it('keeps today above work carried over from earlier days', () => {
    const rows = [
      log({ id: 1, no: 5, date: '2026-08-03', status: '' }),
      log({ id: 2, no: 1, date: '2026-08-04' }),
    ];
    expect(visibleWorkLogs(rows, null, '2026-08-04').map((l) => l.id)).toEqual([2, 1]);
  });

  it('falls back to the id for rows booked before numbering existed', () => {
    const unnumbered = [
      log({ id: 10, date: '2026-08-04' }),
      log({ id: 40, date: '2026-08-04' }),
      log({ id: 20, date: '2026-08-04' }),
    ];
    expect(visibleWorkLogs(unnumbered, null, '2026-08-04').map((l) => l.id)).toEqual([40, 20, 10]);
  });

  it('does not modify the list it was given', () => {
    const rows = [log({ id: 1, no: 1 }), log({ id: 2, no: 2 })];
    const before = rows.map((l) => l.id);
    visibleWorkLogs(rows, null, '2026-08-04');
    expect(rows.map((l) => l.id)).toEqual(before);
  });
});
