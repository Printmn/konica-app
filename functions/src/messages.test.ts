import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dueSoon,
  dueSoonMessage,
  lowStockMessage,
  newOrderMessage,
  chatMessage,
  stockCount,
  timeToMinutes,
} from './messages.ts';
import { batches, recipients, sendPush, type PushDevice } from './push.ts';

describe('newOrderMessage', () => {
  it('bills VAT on top, the way the app does', () => {
    const message = newOrderMessage({ job: 'Нэрийн хуудас', price: '10000', hasVat: true });
    assert.equal(message.body, 'Нэрийн хуудас · 11,000₮');
  });

  it('names the customer and the time it is due', () => {
    const message = newOrderMessage({
      job: 'Баннер',
      price: '5000',
      customer: 'Болд',
      deadline: '15:00',
    });
    assert.equal(message.body, 'Баннер · 5,000₮ — Болд\n⏳ 15:00-д өгнө');
  });

  it('survives a job with nothing but a name', () => {
    assert.equal(newOrderMessage({ job: 'Хэвлэл' }).body, 'Хэвлэл');
  });
});

describe('chatMessage', () => {
  it('says who it is from', () => {
    const message = chatMessage({ sender: 'Сараа', text: 'Цаас дууслаа' });
    assert.equal(message.title, '💬 Сараа');
    assert.equal(message.body, 'Цаас дууслаа');
  });

  it('describes a photo rather than sending an empty line', () => {
    assert.equal(chatMessage({ sender: 'Сараа', image: 'data:...' }).body, '📷 Зураг илгээлээ');
  });
});

describe('stock alerts fire on the edge, not on every write', () => {
  it('announces the crossing', () => {
    const message = lowStockMessage({ name: 'A4 цаас', stock: 6 }, { name: 'A4 цаас', stock: 4 });
    assert.equal(message?.body, 'A4 цаас — 4 ширхэг үлдлээ');
  });

  it('says nothing when it was already low', () => {
    // The counter edits the row again; the box of paper has not got any
    // emptier, and a second alert is just noise.
    assert.equal(lowStockMessage({ stock: 4 }, { name: 'A4 цаас', stock: 3 }), null);
  });

  it('says nothing while stock is healthy', () => {
    assert.equal(lowStockMessage({ stock: 20 }, { stock: 18 }), null);
  });

  it('has its own wording for nothing left', () => {
    const message = lowStockMessage({ stock: 6 }, { name: 'Бэх', stock: 0 });
    assert.equal(message?.title, '🚫 Бараа дууслаа');
  });

  it('reads the messy stock strings the web build left behind', () => {
    assert.equal(stockCount({ stock: '12 ш' }), 12);
    assert.equal(stockCount({ stock: '' }), 0);
    assert.equal(stockCount({}), 0);
  });
});

describe('timeToMinutes', () => {
  it('reads a clock', () => {
    assert.equal(timeToMinutes('15:30'), 930);
    assert.equal(timeToMinutes('09:05'), 545);
  });

  it('rejects anything that is not one', () => {
    assert.equal(timeToMinutes(''), -1);
    assert.equal(timeToMinutes('маргааш'), -1);
    assert.equal(timeToMinutes('25:00'), -1);
  });
});

describe('dueSoon', () => {
  const logs = {
    a: { job: 'Одоо', date: '2026-08-04', deadline: '15:00', status: '' },
    b: { job: 'Дараа', date: '2026-08-04', deadline: '18:00', status: '' },
    c: { job: 'Дууссан', date: '2026-08-04', deadline: '15:10', status: 'Болсон' },
    d: { job: 'Өчигдөр', date: '2026-08-03', deadline: '15:00', status: '' },
    e: { job: 'Цаггүй', date: '2026-08-04', deadline: '', status: '' },
    f: { job: 'Хоцорсон', date: '2026-08-04', deadline: '14:00', status: '' },
  };

  it('takes only today’s unfinished jobs inside the window', () => {
    const due = dueSoon(logs, { today: '2026-08-04', nowMinutes: 14 * 60 + 45 });
    assert.deepEqual(
      due.map((log) => log.job),
      ['Одоо'],
    );
  });

  it('leaves a job that is already late alone', () => {
    // Being reminded every fifteen minutes about something you have already
    // missed teaches people to ignore the alert.
    const due = dueSoon(logs, { today: '2026-08-04', nowMinutes: 14 * 60 + 30 });
    assert.ok(!due.some((log) => log.job === 'Хоцорсон'));
  });

  it('copes with an empty database', () => {
    assert.deepEqual(dueSoon(null, { today: '2026-08-04', nowMinutes: 600 }), []);
  });
});

describe('dueSoonMessage', () => {
  it('names the job when there is only one', () => {
    const message = dueSoonMessage([{ job: 'Баннер', deadline: '15:00' }]);
    assert.equal(message?.body, 'Баннер — 15:00-д өгнө');
  });

  it('counts them when there are several', () => {
    const message = dueSoonMessage([
      { job: 'A' },
      { job: 'B' },
      { job: 'C' },
      { job: 'D' },
    ]);
    assert.equal(message?.title, '⏳ 4 ажлын хугацаа дөхөж байна');
    assert.equal(message?.body, 'A, B, C +1');
  });

  it('is silent when nothing is due', () => {
    assert.equal(dueSoonMessage([]), null);
  });
});

describe('recipients', () => {
  const device = (over: Partial<PushDevice>): PushDevice => ({
    deviceId: 'd1',
    token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
    role: 'manager',
    updatedAt: Date.now(),
    ...over,
  });

  it('never tells a device about its own action', () => {
    const devices = {
      d1: device({ deviceId: 'd1' }),
      d2: device({ deviceId: 'd2' }),
    };
    const out = recipients(devices, { exclude: 'd1' });
    assert.deepEqual(
      out.map((d) => d.deviceId),
      ['d2'],
    );
  });

  it('skips rows with a token Expo would reject', () => {
    const devices = {
      d1: device({ deviceId: 'd1', token: 'not-a-token' }),
      d2: device({ deviceId: 'd2' }),
    };
    assert.equal(recipients(devices).length, 1);
  });

  it('can aim an alert at one role', () => {
    const devices = {
      d1: device({ deviceId: 'd1', role: 'ipad' }),
      d2: device({ deviceId: 'd2', role: 'manager' }),
    };
    const out = recipients(devices, { roles: ['manager'] });
    assert.deepEqual(
      out.map((d) => d.deviceId),
      ['d2'],
    );
  });

  it('drops a device that has not checked in for two months', () => {
    const old = Date.now() - 70 * 24 * 60 * 60 * 1000;
    assert.equal(recipients({ d1: device({ updatedAt: old }) }).length, 0);
  });

  it('copes with an empty registry', () => {
    assert.deepEqual(recipients(null), []);
  });
});

describe('batches', () => {
  it('splits at the size Expo accepts', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    assert.deepEqual(
      batches(items).map((chunk) => chunk.length),
      [100, 100, 50],
    );
  });

  it('gives nothing back for nothing', () => {
    assert.deepEqual(batches([]), []);
  });
});

describe('sendPush', () => {
  const device = (id: string): PushDevice => ({
    deviceId: id,
    token: `ExponentPushToken[${id.padEnd(22, 'x')}]`,
  });

  it('reports the tokens Expo says are dead', async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { status: 'ok' },
            { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const dead = await sendPush(
      [device('d1'), device('d2')],
      { title: 't', body: 'b', channelId: 'orders' },
      fake,
    );
    assert.deepEqual(dead, ['d2']);
  });

  it('swallows a network failure rather than failing the trigger', async () => {
    const fake = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const dead = await sendPush(
      [device('d1')],
      { title: 't', body: 'b', channelId: 'chat' },
      fake,
    );
    assert.deepEqual(dead, []);
  });
});
