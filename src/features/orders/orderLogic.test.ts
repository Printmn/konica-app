import { describe, expect, it } from 'vitest';

import type { WorkLog } from '@/types';

import { buildQuickOrder } from './orderLogic';

const at = (hour: number, minute: number): Date => new Date(2026, 7, 4, hour, minute);

const draft = {
  description: 'Цээж зураг',
  unitPrice: 5000,
  quantity: 2,
  payType: 'Бэлэн' as const,
};

describe('buildQuickOrder', () => {
  it('stamps the clock when no time is given', () => {
    const { order, workLog } = buildQuickOrder({ ...draft, now: at(14, 30) }, []);
    expect(order.time).toBe('14:30');
    expect(workLog.receivedTime).toBe('14:30');
  });

  it('uses the time the counter chose, on both records', () => {
    // The two have to agree: the order feeds the till list and the work log
    // feeds the board and the export, and a sale that reads 09:15 in one place
    // and 14:30 in the other is impossible to reconcile at close of day.
    const { order, workLog } = buildQuickOrder(
      { ...draft, receivedTime: '09:15', now: at(14, 30) },
      [],
    );
    expect(order.time).toBe('09:15');
    expect(workLog.receivedTime).toBe('09:15');
  });

  it('falls back to the clock when the field was cleared', () => {
    const { workLog } = buildQuickOrder({ ...draft, receivedTime: '  ', now: at(14, 30) }, []);
    expect(workLog.receivedTime).toBe('14:30');
  });

  it('still prices and numbers the job the way it always did', () => {
    const existing = [{ date: '2026-08-04' } as WorkLog, { date: '2026-08-03' } as WorkLog];
    const { order, workLog } = buildQuickOrder({ ...draft, now: at(14, 30) }, existing);

    expect(order.price).toBe(10000);
    expect(workLog.price).toBe('10000');
    expect(workLog.unitPrice).toBe('5000');
    expect(workLog.job).toBe('Цээж зураг (2ш)');
    // Second job of the day: the other existing row belongs to yesterday.
    expect(workLog.no).toBe(2);
  });

  it('gives the order and its mirrored log different ids', () => {
    // Same id would mean one overwrites the other in Firebase.
    const { order, workLog } = buildQuickOrder({ ...draft, now: at(14, 30) }, []);
    expect(order.id).not.toBe(workLog.id);
  });
});
