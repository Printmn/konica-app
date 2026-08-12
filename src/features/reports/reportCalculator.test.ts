import { describe, expect, it } from 'vitest';

import type { WorkLog } from '@/types';

import { calculateDailyReport, rawTotal, totalsByPayType } from './reportCalculator';

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
    });
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
