import { describe, expect, it } from 'vitest';

import type { WorkLog } from '@/types';

import {
  baseJobName,
  calculateDailyReport,
  groupByJob,
  isUnsettled,
  latestDayOf,
  monthOf,
  monthTotals,
  rawTotal,
  reportDates,
  reportMonths,
  stepDay,
  totalsByPayType,
} from './reportCalculator';

const log = (over: Partial<WorkLog>): WorkLog =>
  ({
    id: Math.random(),
    job: 'Хэвлэл',
    price: '10000',
    payType: 'Бэлэн',
    date: '2026-08-04',
    hasVat: false,
    ...over,
  }) as WorkLog;

describe('calculateDailyReport', () => {
  it('counts only the requested day', () => {
    const report = calculateDailyReport(
      [log({ price: '10000' }), log({ price: '99000', date: '2026-08-03' })],
      '2026-08-04',
    );
    expect(report.logs).toHaveLength(1);
    expect(report.totalRevenue).toBe(10000);
  });

  it('skips rows with no price', () => {
    const report = calculateDailyReport([log({ price: '' }), log({ price: '5000' })], '2026-08-04');
    expect(report.logs).toHaveLength(1);
    expect(report.totalRevenue).toBe(5000);
  });

  it('splits the total across payment methods', () => {
    const report = calculateDailyReport(
      [
        log({ price: '10000', payType: 'Бэлэн' }),
        log({ price: '20000', payType: 'Данс' }),
        log({ price: '30000', payType: 'Карт' }),
      ],
      '2026-08-04',
    );
    expect(report.totalCash).toBe(10000);
    expect(report.totalTransfer).toBe(20000);
    expect(report.totalCard).toBe(30000);
    expect(report.totalRevenue).toBe(60000);
  });

  it('puts each half of a mixed payment in its own column', () => {
    const report = calculateDailyReport(
      [
        log({
          price: '5000',
          payType: 'Холимог',
          paySplit: { cash: 2000, card: 3000, transfer: 0 },
        }),
        log({ price: '10000', payType: 'Бэлэн' }),
      ],
      '2026-08-04',
    );
    expect(report.totalCash).toBe(12000);
    expect(report.totalCard).toBe(3000);
    expect(report.totalTransfer).toBe(0);
    expect(report.totalRevenue).toBe(15000);
  });

  it('reports revenue with VAT included but the VAT line separately', () => {
    const report = calculateDailyReport(
      [log({ price: '10000', hasVat: true }), log({ price: '10000', hasVat: false })],
      '2026-08-04',
    );
    expect(report.totalRevenue).toBe(21000);
    expect(report.totalVat).toBe(1000);
  });

  it('is all zeroes for a day with nothing in it', () => {
    const report = calculateDailyReport([], '2026-08-04');
    expect(report).toMatchObject({
      totalRevenue: 0,
      totalCash: 0,
      totalCard: 0,
      totalTransfer: 0,
      totalVat: 0,
      totalUnsettled: 0,
      unsettledCount: 0,
    });
  });
});

/**
 * Work handed over against an invoice was being added to the day's takings, so
 * the till read as holding money that had not arrived — and the three payment
 * lines silently stopped adding up to the total printed above them.
 */
describe('«Тооцоотой» is held out of the takings', () => {
  const day = '2026-08-04';

  it('keeps the unpaid job out of the total and reports it separately', () => {
    const report = calculateDailyReport(
      [
        log({ id: 1, date: day, price: '50000', payType: 'Бэлэн' }),
        log({ id: 2, date: day, price: '30000', status: 'Тооцоотой' }),
      ],
      day,
    );
    expect(report.totalRevenue).toBe(50000);
    expect(report.totalUnsettled).toBe(30000);
    expect(report.unsettledCount).toBe(1);
  });

  it('keeps it out of the payment columns too, even when it names a method', () => {
    // The commonest shape: booked «Данс», to be transferred later. Left in, it
    // was counted once in the total and again under Данс.
    const report = calculateDailyReport(
      [
        log({ id: 1, date: day, price: '50000', payType: 'Бэлэн' }),
        log({ id: 2, date: day, price: '30000', payType: 'Данс', status: 'Тооцоотой' }),
      ],
      day,
    );
    expect(report.totalTransfer).toBe(0);
    expect(report.totalCash + report.totalCard + report.totalTransfer).toBe(report.totalRevenue);
  });

  it('leaves the row on the day’s list — it is owed, not deleted', () => {
    const report = calculateDailyReport(
      [log({ id: 1, date: day, price: '30000', status: 'Тооцоотой' })],
      day,
    );
    expect(report.logs).toHaveLength(1);
    expect(report.totalRevenue).toBe(0);
  });

  it('still recognises the legacy paymentStatus spelling', () => {
    // The form dropped the option; records written before that are still here.
    expect(isUnsettled({ status: '', paymentStatus: 'Тооцоотой' })).toBe(true);
    expect(isUnsettled({ status: 'Тооцоотой', paymentStatus: '' })).toBe(true);
    expect(isUnsettled({ status: 'Болсон', paymentStatus: 'Төлөгдсөн' })).toBe(false);
  });

  it('reports VAT over the paid rows only, so «үүнээс» is true', () => {
    const report = calculateDailyReport(
      [
        log({ id: 1, date: day, price: '50000', payType: 'Бэлэн', hasVat: true }),
        log({ id: 2, date: day, price: '30000', status: 'Тооцоотой', hasVat: true }),
      ],
      day,
    );
    expect(report.totalVat).toBe(5000);
  });
});

describe('totalsByPayType', () => {
  it('groups untyped rows under Бусад', () => {
    const totals = totalsByPayType([
      log({ price: '1000', payType: 'Бэлэн' }),
      log({ price: '2000', payType: undefined }),
      log({
        price: '5000',
        payType: 'Холимог',
        paySplit: { cash: 2000, card: 3000, transfer: 0 },
      }),
    ]);
    // The mixed row is booked under the methods it was paid with, not under
    // «Холимог» — the export's summary rows have to reconcile with the till.
    expect(totals).toEqual({ Бэлэн: 3000, Бусад: 2000, Карт: 3000 });
  });
});

describe('rawTotal', () => {
  it('ignores VAT, unlike the daily report', () => {
    expect(rawTotal([log({ price: '10000', hasVat: true })])).toBe(10000);
  });
});

/**
 * «Цээж зураг 40ш · 80,000₮» — what the day was made of, rather than one row
 * per booking. The grouping key has to survive `buildQuickOrder`, which writes
 * the count into the job name.
 */
describe('groupByJob', () => {
  it('strips the count quick orders bake into the name', () => {
    expect(baseJobName('Цээж зураг (2ш)')).toBe('Цээж зураг');
    expect(baseJobName('Бичиг баримт канон ( 35 ш )')).toBe('Бичиг баримт канон');
    expect(baseJobName('Өргөмжлөл А4 (10ш дээш)')).toBe('Өргөмжлөл А4 (10ш дээш)');
  });

  it('gathers separate bookings of the same thing', () => {
    const groups = groupByJob([
      log({ id: 1, job: 'Цээж зураг (2ш)', quantity: 2, price: '4000' }),
      log({ id: 2, job: 'Цээж зураг (4ш)', quantity: 4, price: '8000' }),
      log({ id: 3, job: 'Баннер', quantity: 1, price: '80000' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'Баннер', quantity: 1, orders: 1, total: 80000 });
    expect(groups[1]).toMatchObject({ name: 'Цээж зураг', quantity: 6, orders: 2, total: 12000 });
  });

  it('treats the same product typed in different case as one', () => {
    const groups = groupByJob([
      log({ id: 1, job: 'цээж зураг', price: '4000' }),
      log({ id: 2, job: 'Цээж Зураг', price: '4000' }),
    ]);
    expect(groups).toHaveLength(1);
    // The first spelling seen is the one shown.
    expect(groups[0]?.name).toBe('цээж зураг');
  });

  it('counts a job with no quantity as one, never as zero', () => {
    // «Цээж зураг 0ш · 80,000₮» out of a real sale would be worse than silence.
    expect(groupByJob([log({ id: 1, job: 'Баннер', price: '80000' })])[0]?.quantity).toBe(1);
  });

  it('falls back to the count in the name when the form recorded none', () => {
    expect(groupByJob([log({ id: 1, job: 'Цээж зураг (9ш)', price: '18000' })])[0]?.quantity).toBe(9);
  });

  it('uses the VAT-inclusive figure, like every other total on the report', () => {
    const groups = groupByJob([log({ id: 1, job: 'Ном', price: '100000', hasVat: true })]);
    expect(groups[0]?.total).toBe(110000);
  });

  it('flags how much of a group is still owed', () => {
    const groups = groupByJob([
      log({ id: 1, job: 'Ном', price: '100000' }),
      log({ id: 2, job: 'Ном', price: '40000', status: 'Тооцоотой' }),
    ]);
    expect(groups[0]).toMatchObject({ total: 140000, unsettled: 40000, orders: 2 });
  });

  it('puts the biggest earner first', () => {
    const groups = groupByJob([
      log({ id: 1, job: 'Хуулбар', price: '500' }),
      log({ id: 2, job: 'Баннер', price: '80000' }),
    ]);
    expect(groups.map((group) => group.name)).toEqual(['Баннер', 'Хуулбар']);
  });

  it('files a nameless job rather than dropping it', () => {
    expect(groupByJob([log({ id: 1, job: '', price: '5000' })])[0]?.name).toBe('Нэргүй ажил');
  });
});

/**
 * The report is no longer today-only, so it needs a list of days to walk. It
 * covers spending as well as takings, which is why expenses are a source too.
 */
describe('reportDates', () => {
  const jobs = [{ date: '2026-09-10' }, { date: '2026-09-12' }, { date: '2026-09-10' }];
  const spend = [{ date: '2026-09-11' }, { date: '2026-09-12' }];

  it('merges the days money came in with the days it went out', () => {
    expect(reportDates(jobs, spend, '2026-09-14')).toEqual([
      '2026-09-14',
      '2026-09-12',
      '2026-09-11',
      '2026-09-10',
    ]);
  });

  it('keeps today even when nothing has happened yet', () => {
    // A report that cannot be opened before the first sale looks broken every
    // morning.
    expect(reportDates([], [], '2026-09-14')).toEqual(['2026-09-14']);
  });

  it('offers a day that only had spending on it', () => {
    // A Sunday with a paper delivery and no orders is worth opening.
    expect(reportDates([], [{ date: '2026-09-06' }], '2026-09-14')).toContain('2026-09-06');
  });

  it('ignores rows with no date rather than listing a blank day', () => {
    expect(reportDates([{ date: '' }], [], '2026-09-14')).toEqual(['2026-09-14']);
  });
});

describe('stepDay', () => {
  const days = ['2026-09-14', '2026-09-12', '2026-09-10'];

  it('steps to the previous day that has something on it', () => {
    // Not calendar days: «previous» must never land on a Sunday the shop shut.
    expect(stepDay(days, '2026-09-14', 1)).toBe('2026-09-12');
  });

  it('steps forward again', () => {
    expect(stepDay(days, '2026-09-12', -1)).toBe('2026-09-14');
  });

  it('stops at both ends rather than wrapping', () => {
    expect(stepDay(days, '2026-09-10', 1)).toBeNull();
    expect(stepDay(days, '2026-09-14', -1)).toBeNull();
  });

  it('returns null for a day that is not in the list', () => {
    expect(stepDay(days, '2026-01-01', 1)).toBeNull();
  });
});

/**
 * The month has to be the sum of its days, or nobody can check it. Same rules
 * as `calculateDailyReport`: VAT included, «Тооцоотой» held out.
 */
describe('monthTotals', () => {
  const logs = [
    log({ id: 1, date: '2026-09-02', price: '50000', payType: 'Бэлэн', status: 'Болсон' }),
    log({ id: 2, date: '2026-09-02', price: '100000', hasVat: true, status: 'Болсон' }),
    log({ id: 3, date: '2026-09-14', price: '85000', status: 'Тооцоотой' }),
    log({ id: 4, date: '2026-08-31', price: '999999', status: 'Болсон' }),
    log({ id: 5, date: '2026-09-20', price: '', status: 'Болсон' }),
  ];
  const spend = [
    { date: '2026-09-02', amount: 14000 },
    { date: '2026-09-25', amount: 9000 },
    { date: '2026-08-31', amount: 500000 },
  ];

  it('totals only the month asked for', () => {
    const month = monthTotals(logs, spend, '2026-09');
    // 50,000 + 110,000 (VAT-inclusive). August's 999,999 stays in August.
    expect(month.revenue).toBe(160000);
    expect(month.spent).toBe(23000);
    expect(month.net).toBe(137000);
  });

  it('holds work on account out of the takings, as the day does', () => {
    expect(monthTotals(logs, spend, '2026-09').unsettled).toBe(85000);
  });

  it('counts priced jobs, not blank rows', () => {
    // A row with no price is a booking, not revenue; the day ignores it too.
    expect(monthTotals(logs, spend, '2026-09').orders).toBe(3);
  });

  it('counts days that had either money in or money out', () => {
    // 09-02 (both), 09-14 (an invoice), 09-25 (spending only).
    expect(monthTotals(logs, spend, '2026-09').activeDays).toBe(3);
  });

  it('adds up to the days inside it', () => {
    const byDay = ['2026-09-02', '2026-09-14', '2026-09-20'].reduce(
      (sum, day) => sum + calculateDailyReport(logs, day).totalRevenue,
      0,
    );
    expect(monthTotals(logs, spend, '2026-09').revenue).toBe(byDay);
  });

  it('is all zeroes for a month with nothing in it', () => {
    expect(monthTotals(logs, spend, '2026-01')).toMatchObject({
      revenue: 0,
      spent: 0,
      net: 0,
      orders: 0,
      activeDays: 0,
    });
  });

  it('reads the month off a date', () => {
    expect(monthOf('2026-09-14')).toBe('2026-09');
    expect(monthOf('')).toBe('');
  });
});

/**
 * Month chips in the report's day picker. Derived from the day list rather
 * than scanned separately, so a month can never be offered with no day behind
 * it — picking it would open an empty report and look broken.
 */
describe('reportMonths', () => {
  const days = ['2026-09-19', '2026-09-12', '2026-08-31', '2026-06-02'];

  it('lists each month once, newest first', () => {
    expect(reportMonths(days)).toEqual(['2026-09', '2026-08', '2026-06']);
  });

  it('lands on the month’s most recent day', () => {
    // The chip has to move the day too, or the screen shows one month in the
    // summary and another in the list.
    expect(latestDayOf(days, '2026-09')).toBe('2026-09-19');
    expect(latestDayOf(days, '2026-06')).toBe('2026-06-02');
  });

  it('has nothing to land on for a month with no days', () => {
    expect(latestDayOf(days, '2026-01')).toBeNull();
  });

  it('ignores blank dates rather than offering an empty month', () => {
    expect(reportMonths(['', '2026-09-19'])).toEqual(['2026-09']);
  });
});
