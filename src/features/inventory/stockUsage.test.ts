import { describe, expect, it } from 'vitest';

import type { InventoryItem, StockUsage } from '@/types';

import {
  applyUsage,
  byItem,
  createUsage,
  dailyBars,
  daysOfStock,
  inWindowRows,
  onDay,
  paperFor,
  paperSize,
  pendingPaperLogs,
  reconcilePaperUsage,
  paperStock,
  parseQuantity,
  syncPaperUsage,
  revertUsage,
  setStock,
  totalSheets,
  validateUsage,
  windowTotal,
} from './stockUsage';
import { addMissingPapers, missingPaperNames } from './stockSeed';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 1,
  name: 'A4 цаас',
  price: '150',
  stock: '500',
  image: null,
  category: 'Цаас',
  ...over,
});

const use = (over: Partial<StockUsage>): StockUsage => ({
  id: Math.random(),
  date: '2026-08-04',
  itemId: 1,
  itemName: 'A4 цаас',
  quantity: 250,
  note: '',
  by: 'Сараа',
  at: Date.now(),
  ...over,
});

describe('parseQuantity', () => {
  it('reads what the counter types', () => {
    expect(parseQuantity('250')).toBe(250);
    expect(parseQuantity('250ш')).toBe(250);
    expect(parseQuantity('2 500')).toBe(2500);
    expect(parseQuantity('')).toBe(0);
  });
});

describe('validateUsage', () => {
  const draft = { itemId: 1, itemName: 'A4', quantity: '250', note: '', by: 'Сараа' };

  it('accepts a real entry', () => {
    expect(validateUsage(draft)).toBeNull();
  });

  it('insists on an item and a number', () => {
    expect(validateUsage({ ...draft, itemId: 0 })).toBe('Бараагаа сонгоно уу.');
    expect(validateUsage({ ...draft, quantity: '0' })).toBe('Ширхэгээ оруулна уу.');
  });
});

describe('createUsage', () => {
  it('files it under the day it was drawn, with the name copied on', () => {
    const entry = createUsage(
      { itemId: 7, itemName: 'A3 цаас', quantity: '120ш', note: ' том захиалга ', by: 'Болд' },
      new Date(2026, 7, 4, 14, 30),
    );
    expect(entry.date).toBe('2026-08-04');
    expect(entry.quantity).toBe(120);
    expect(entry.itemName).toBe('A3 цаас');
    expect(entry.note).toBe('том захиалга');
  });
});

describe('applyUsage', () => {
  it('takes the sheets off the shelf', () => {
    const next = applyUsage([item({ stock: '500' })], 1, 250);
    expect(next[0]?.stock).toBe('250');
  });

  it('touches nothing else', () => {
    const next = applyUsage([item({ id: 1 }), item({ id: 2, stock: '90' })], 1, 10);
    expect(next[1]?.stock).toBe('90');
  });

  it('reads the messy stock strings the web build left behind', () => {
    expect(applyUsage([item({ stock: '' })], 1, 10)[0]?.stock).toBe('-10');
    expect(applyUsage([item({ stock: '22 ш' })], 1, 2)[0]?.stock).toBe('20');
  });

  it('lets the shelf go negative rather than hiding a miscount', () => {
    // −30 is somebody's counting error, and it is exactly the thing worth
    // seeing. Clamping to zero would make it invisible.
    expect(applyUsage([item({ stock: '20' })], 1, 50)[0]?.stock).toBe('-30');
  });

  it('is undone exactly by revertUsage', () => {
    const shelf = [item({ stock: '500' })];
    const after = applyUsage(shelf, 1, 250);
    expect(revertUsage(after, 1, 250)[0]?.stock).toBe('500');
  });
});

describe('byItem', () => {
  it('adds up per item, heaviest first', () => {
    const rows = byItem([
      use({ itemId: 1, itemName: 'A4', quantity: 250 }),
      use({ itemId: 2, itemName: 'A3', quantity: 400 }),
      use({ itemId: 1, itemName: 'A4', quantity: 100 }),
    ]);
    expect(rows).toEqual([
      { itemId: 2, name: 'A3', quantity: 400, times: 1 },
      { itemId: 1, name: 'A4', quantity: 350, times: 2 },
    ]);
  });
});

describe('onDay and totalSheets', () => {
  const rows = [
    use({ id: 1, date: '2026-08-04', quantity: 250, at: 100 }),
    use({ id: 2, date: '2026-08-04', quantity: 100, at: 200 }),
    use({ id: 3, date: '2026-08-03', quantity: 999 }),
  ];

  it('takes one day, newest first', () => {
    expect(onDay(rows, '2026-08-04').map((row) => row.id)).toEqual([2, 1]);
  });

  it('adds up what it was handed', () => {
    expect(totalSheets(onDay(rows, '2026-08-04'))).toBe(350);
  });
});

describe('dailyBars', () => {
  const rows = [
    use({ date: '2026-08-04', quantity: 400 }),
    use({ date: '2026-08-02', quantity: 200 }),
    use({ date: '2026-07-01', quantity: 99999 }),
  ];

  it('covers seven days ending today', () => {
    const bars = dailyBars(rows, { today: '2026-08-04' });
    expect(bars).toHaveLength(7);
    expect(bars[6]?.isToday).toBe(true);
    expect(bars[6]?.total).toBe(400);
  });

  it('scales against the busiest day inside the window only', () => {
    const bars = dailyBars(rows, { today: '2026-08-04' });
    expect(bars[6]?.height).toBe(1);
    expect(bars[4]?.height).toBe(0.5);
  });

  it('totals only the window, and ignores what fell outside it', () => {
    expect(windowTotal(dailyBars(rows, { today: '2026-08-04' }))).toBe(600);
  });

  it('draws flat on an empty week', () => {
    expect(dailyBars([], { today: '2026-08-04' }).every((bar) => bar.height === 0)).toBe(true);
  });
});

describe('inWindowRows', () => {
  it('keeps only the days the chart drew', () => {
    const rows = inWindowRows(
      [use({ id: 1, date: '2026-08-04' }), use({ id: 2, date: '2026-07-01' })],
      [{ date: '2026-08-04' }],
    );
    expect(rows.map((row) => row.id)).toEqual([1]);
  });
});

describe('daysOfStock', () => {
  it('turns a shelf count into the form the question is asked in', () => {
    // 700 sheets over the week is 100 a day; 400 left is four days.
    const rows = [use({ itemId: 1, quantity: 700 })];
    expect(daysOfStock(item({ id: 1, stock: '400' }), rows)).toBe(4);
  });

  it('says nothing about a shelf nobody has drawn from', () => {
    expect(daysOfStock(item({ id: 1, stock: '400' }), [])).toBeNull();
  });

  it('is zero once the shelf is empty', () => {
    const rows = [use({ itemId: 1, quantity: 700 })];
    expect(daysOfStock(item({ id: 1, stock: '0' }), rows)).toBe(0);
    expect(daysOfStock(item({ id: 1, stock: '-30' }), rows)).toBe(0);
  });
});

/**
 * Counting the shelf, as opposed to drawing from it.
 *
 * The running total drifts — paper used without the app open, a delivery — so
 * the figure has to be correctable by hand rather than only by arithmetic.
 */
describe('setStock', () => {
  const shelf = [item({ id: 1, name: 'Бичгийн цаас А4', stock: '17' })];

  it('replaces the count rather than adjusting it', () => {
    expect(setStock(shelf, 1, 500)[0]?.stock).toBe('500');
  });

  it('stores it as a plain string, the way the database holds stock', () => {
    expect(setStock(shelf, 1, 0)[0]?.stock).toBe('0');
  });

  it('refuses to go below zero — a counted shelf cannot be negative', () => {
    // `applyUsage` may go negative on purpose: that is a counting error worth
    // seeing. A number somebody just counted is not.
    expect(setStock(shelf, 1, -40)[0]?.stock).toBe('0');
  });

  it('rounds a stray decimal down to whole sheets', () => {
    expect(setStock(shelf, 1, 249.9)[0]?.stock).toBe('249');
  });

  it('leaves every other item alone', () => {
    const two = [...shelf, item({ id: 2, name: 'Фото цаас А4', stock: '22' })];
    expect(setStock(two, 1, 100)[1]?.stock).toBe('22');
  });

  it('is what the next deduction starts from', () => {
    const counted = setStock(shelf, 1, 500);
    expect(applyUsage(counted, 1, 250)[0]?.stock).toBe('250');
  });
});

/**
 * The screen shows the papers the shop consumes and nothing else, so the
 * predicate that decides "which papers" is worth pinning down. Matched on the
 * name because the «Цаас» category also holds A3 and sticker stock.
 */
describe('paperStock', () => {
  const shelf = [
    item({ id: 7, name: 'Бичгийн цаас А4', category: 'Цаас' }),
    item({ id: 8, name: 'Бичгийн цаас А3', category: 'Цаас' }),
    item({ id: 9, name: 'Фото цаас А4 157гр (2 талтай)', category: 'Цаас' }),
    item({ id: 12, name: 'Фото цаас А3 (2 талтай)', category: 'Цаас' }),
    item({ id: 13, name: 'Фото шар А4', category: 'Цаас' }),
    item({ id: 15, name: 'Стикер цаас А4 гялгар', category: 'Цаас' }),
    item({ id: 20, name: 'Хэвлэх бэх', category: 'Бэх' }),
  ];

  it('keeps A4 writing paper and every photo paper', () => {
    expect(paperStock(shelf).map((row) => row.id)).toEqual([7, 9, 12, 13]);
  });

  it('leaves A3 writing paper and sticker stock out', () => {
    const ids = paperStock(shelf).map((row) => row.id);
    expect(ids).not.toContain(8);
    expect(ids).not.toContain(15);
  });

  it('accepts the Latin A as well as the Cyrillic one', () => {
    // The catalogue writes Cyrillic А4 (U+0410); a hand-typed item is as likely
    // to carry the Latin one, and on screen they are the same character.
    expect(paperStock([item({ id: 1, name: 'Бичгийн цаас A4' })])).toHaveLength(1);
  });

  it('tolerates stray spacing and case', () => {
    expect(paperStock([item({ id: 1, name: '  бичгийн  цаас  а4  ' })])).toHaveLength(1);
  });

  it('does not match a paper mentioned mid-name', () => {
    // «Хэвлэл: Фото цаас А4» is a service, priced per sheet printed. It is not
    // stock and must never appear on a shelf that gets decremented.
    expect(paperStock([item({ id: 1, name: 'Хэвлэл: Фото цаас А4 200гр' })])).toEqual([]);
  });
});

/**
 * Paper an order takes off the shelf by itself.
 *
 * The shelf has to survive the three things that happen to an order after it
 * is booked: a corrected quantity, a changed job, and deletion.
 */
describe('paperStock order', () => {
  it('leads with A4 writing paper, then the two hand-cut sizes', () => {
    // Catalogue order buried the small sizes below six A4 variants, which is
    // what made them hard to find.
    const shelf = [
      item({ id: 12, name: 'Фото цаас А3 (2 талтай)' }),
      item({ id: 42, name: 'Фото цаас 16x22' }),
      item({ id: 10, name: 'Фото цаас А4 200гр (2 талтай)' }),
      item({ id: 41, name: 'Фото цаас 10x15' }),
      item({ id: 7, name: 'Бичгийн цаас А4' }),
    ];
    expect(paperStock(shelf).map((row) => row.id)).toEqual([7, 41, 42, 12, 10]);
  });

  it('accepts the Cyrillic х in 10х15 as well as the Latin x', () => {
    const shelf = [
      item({ id: 10, name: 'Фото цаас А4 200гр' }),
      item({ id: 41, name: 'Фото цаас 10х15' }),
    ];
    expect(paperStock(shelf)[0]?.id).toBe(41);
  });
});

describe('paperFor', () => {
  const shelf = [
    item({ id: 7, name: 'Бичгийн цаас А4', stock: '500' }),
    item({ id: 10, name: 'Фото цаас А4 200гр (2 талтай)', stock: '40' }),
    item({ id: 41, name: 'Фото цаас 10x15', stock: '60' }),
    item({ id: 20, name: 'Хэвлэх бэх', stock: '3' }),
  ];

  it('matches the paper an order names, with the count from its name', () => {
    expect(paperFor({ job: 'Бичгийн цаас А4 (10ш)' }, shelf)).toMatchObject({ sheets: 10 });
    expect(paperFor({ job: 'Бичгийн цаас А4 (10ш)' }, shelf)?.item.id).toBe(7);
  });

  it('prefers the recorded quantity over the one in the name', () => {
    // The form is the record; the name is a label written at booking time.
    expect(paperFor({ job: 'Бичгийн цаас А4 (10ш)', quantity: 4 }, shelf)?.sheets).toBe(4);
  });

  it('ignores the parenthetical the catalogue carries', () => {
    expect(paperFor({ job: 'Фото цаас А4 200гр', quantity: 5 }, shelf)?.item.id).toBe(10);
  });

  it('matches the new sizes', () => {
    expect(paperFor({ job: 'Фото цаас 10x15 (24ш)' }, shelf)?.item.id).toBe(41);
  });

  it('does not guess at a service that names no size', () => {
    // «Бичиг баримт канон» consumes paper, but which paper and how many sheets
    // per copy is a rule the shop has not written down.
    expect(paperFor({ job: 'Бичиг баримт канон (9ш)' }, shelf)).toBeNull();
    expect(paperFor({ job: 'Цээж зураг (4ш)' }, shelf)).toBeNull();
  });

  /**
   * The case the name match missed. «Зураг угаалт 10*15 ×100» is a service,
   * named nothing like the stock it consumes, and a hundred sheets came off
   * the shelf all the same.
   */
  it('handles every paper, not a chosen few', () => {
    const withA3 = [...shelf, item({ id: 12, name: 'Фото цаас А3 (2 талтай)' })];
    expect(paperFor({ job: 'Зураг угаалт А3', quantity: 2 }, withA3)?.item.id).toBe(12);
  });

  /**
   * The middle pass. A service that spells the paper out inside a longer name
   * is that exact stock with a word in front, and matching only whole names
   * missed every «Хэвлэл: …» the shop sells.
   */
  it('finds a paper named inside a longer job', () => {
    const many = [
      ...shelf,
      item({ id: 9, name: 'Фото цаас А4 157гр (2 талтай)' }),
      item({ id: 10, name: 'Фото цаас А4 200гр (2 талтай)' }),
      item({ id: 13, name: 'Фото шар А4' }),
    ];
    expect(paperFor({ job: 'Хэвлэл: Фото цаас А4 200гр', quantity: 5 }, many)?.item.id).toBe(10);
    expect(paperFor({ job: 'Фото шар А4 хэвлэх', quantity: 2 }, many)?.item.id).toBe(13);
  });

  it('prefers the longest name when one paper is a prefix of another', () => {
    // «Фото цаас А4» is a prefix of «Фото цаас А4 200гр»: the shorter one is
    // not a different answer, it is a worse-specified one.
    const both = [
      item({ id: 50, name: 'Фото цаас А4' }),
      item({ id: 10, name: 'Фото цаас А4 200гр (2 талтай)' }),
    ];
    expect(paperFor({ job: 'Хэвлэл: Фото цаас А4 200гр', quantity: 5 }, both)?.item.id).toBe(10);
  });

  it('falls back to the size a service names', () => {
    expect(paperFor({ job: 'Зураг угаалт 10*15', quantity: 100 }, shelf)).toMatchObject({
      sheets: 100,
    });
    expect(paperFor({ job: 'Зураг угаалт 10*15', quantity: 100 }, shelf)?.item.id).toBe(41);
  });

  it('does not take paper for something that merely names a size', () => {
    // «Улаан хавтас А4» is a folder and «Жааз 60х40» a frame. Both carry a
    // size, neither is printed on the shop's paper, and matching on the size
    // alone quietly took sheets off the wrong shelf.
    const withFolder = [...shelf, item({ id: 30, name: 'Улаан хавтас А4' })];
    expect(paperFor({ job: 'Улаан хавтас А4', quantity: 3 }, withFolder)).toBeNull();
    expect(paperFor({ job: 'Жааз 60х40', quantity: 1 }, withFolder)).toBeNull();
    expect(paperFor({ job: 'Ламинатор А4', quantity: 2 }, withFolder)).toBeNull();
  });

  it('refuses the size fallback when several papers share it', () => {
    // «Өргөмжлөл А4» names a size and nothing more, and five A4 papers sit on
    // a real shelf. Taking stock off one of five at random is worse than
    // taking none: nobody would know which to correct afterwards.
    const manyA4 = [
      ...shelf,
      item({ id: 9, name: 'Фото цаас А4 157гр (2 талтай)' }),
      item({ id: 13, name: 'Фото шар А4' }),
    ];
    expect(paperFor({ job: 'Өргөмжлөл А4', quantity: 3 }, manyA4)).toBeNull();
  });

  it('ignores anything that is not paper', () => {
    expect(paperFor({ job: 'Хэвлэх бэх' }, shelf)).toBeNull();
    expect(paperFor({ job: '' }, shelf)).toBeNull();
  });
});

describe('syncPaperUsage', () => {
  const shelf = [item({ id: 7, name: 'Бичгийн цаас А4', stock: '500' })];
  const left = (rows: readonly InventoryItem[]): string => rows[0]?.stock ?? '';

  it('takes the sheets off and logs the draw against the order', () => {
    const out = syncPaperUsage([], shelf, 99, { job: 'Бичгийн цаас А4 (10ш)' }, 'iPad');
    expect(left(out.inventory)).toBe('490');
    expect(out.usage[0]).toMatchObject({ logId: 99, quantity: 10, note: 'Захиалгаар' });
    expect(out.drawn).toEqual({ name: 'Бичгийн цаас А4', sheets: 10 });
  });

  it('nets the correction rather than deducting twice', () => {
    // 10 changed to 4 should leave the shelf six sheets better off, not
    // fourteen worse. This is the bug the logId exists to prevent.
    const first = syncPaperUsage([], shelf, 99, { job: 'Бичгийн цаас А4 (10ш)' }, 'iPad');
    const second = syncPaperUsage(
      first.usage,
      first.inventory,
      99,
      { job: 'Бичгийн цаас А4 (4ш)' },
      'iPad',
    );
    expect(left(second.inventory)).toBe('496');
    expect(second.usage.filter((row) => row.logId === 99)).toHaveLength(1);
  });

  it('is idempotent — running twice on the same order changes nothing', () => {
    const once = syncPaperUsage([], shelf, 99, { job: 'Бичгийн цаас А4 (10ш)' }, 'iPad');
    const twice = syncPaperUsage(
      once.usage,
      once.inventory,
      99,
      { job: 'Бичгийн цаас А4 (10ш)' },
      'iPad',
    );
    expect(left(twice.inventory)).toBe('490');
  });

  it('puts the paper back when the order is deleted', () => {
    const drawn = syncPaperUsage([], shelf, 99, { job: 'Бичгийн цаас А4 (10ш)' }, 'iPad');
    const gone = syncPaperUsage(drawn.usage, drawn.inventory, 99, null, 'iPad');
    expect(left(gone.inventory)).toBe('500');
    expect(gone.usage).toHaveLength(0);
  });

  it('puts it back when the job is changed to something that is not paper', () => {
    const drawn = syncPaperUsage([], shelf, 99, { job: 'Бичгийн цаас А4 (10ш)' }, 'iPad');
    const swapped = syncPaperUsage(drawn.usage, drawn.inventory, 99, { job: 'Аяга' }, 'iPad');
    expect(left(swapped.inventory)).toBe('500');
    expect(swapped.drawn).toBeNull();
  });

  it('never touches a line typed in by hand', () => {
    const manual = createUsage({
      itemId: 7,
      itemName: 'Бичгийн цаас А4',
      quantity: '250',
      note: 'Гараар',
      by: 'Бат',
    });
    const out = syncPaperUsage([manual], shelf, 99, null, 'iPad');
    expect(out.usage).toEqual([manual]);
    expect(left(out.inventory)).toBe('500');
  });

  it('files the draw on the order’s own day, not today', () => {
    const out = syncPaperUsage(
      [],
      shelf,
      99,
      { job: 'Бичгийн цаас А4 (10ш)', date: '2026-08-04' },
      'iPad',
    );
    expect(out.usage[0]?.date).toBe('2026-08-04');
  });
});

/**
 * A size added to the standing list never reaches a shop that already has its
 * own rows — the seed stops being the source of truth the moment the database
 * has one. «Фото цаас 10x15» was added and simply did not appear.
 */
describe('missing papers', () => {
  const shelf = [
    item({ id: 7, name: 'Бичгийн цаас А4', stock: '500' }),
    item({ id: 20, name: 'Хэвлэх бэх', stock: '3' }),
  ];

  it('names the papers the shop has no row for', () => {
    const missing = missingPaperNames(shelf);
    expect(missing).toContain('Фото цаас 10x15');
    expect(missing).toContain('Фото цаас 16x22');
  });

  it('does not offer one that is already there', () => {
    expect(missingPaperNames(shelf)).not.toContain('Бичгийн цаас А4');
  });

  it('adds only papers, leaving the rest of the standing list alone', () => {
    const added = addMissingPapers(shelf);
    const names = added.map((row) => row.name);
    expect(names).toContain('Фото цаас 10x15');
    // Жааз and Медаль are on the standing list too; this button is not that.
    expect(names.some((name) => name.startsWith('Жааз'))).toBe(false);
  });

  it('never touches an existing row’s stock', () => {
    // Overwriting a count from a list in the code would undo a day of counting.
    const added = addMissingPapers(shelf);
    expect(added.find((row) => row.id === 7)?.stock).toBe('500');
  });

  it('is empty once every paper is in', () => {
    expect(missingPaperNames(addMissingPapers(shelf))).toEqual([]);
  });

  it('puts the new sizes where paperStock can see them', () => {
    const names = paperStock(addMissingPapers(shelf)).map((row) => row.name);
    expect(names).toContain('Фото цаас 10x15');
    expect(names).toContain('Фото цаас 16x22');
  });
});

describe('paperSize', () => {
  it('reads every separator the counter types', () => {
    // «10*15», «10x15», «10х15» (Cyrillic х) and «10 × 15» are one size.
    expect(paperSize('Зураг угаалт 10*15')).toBe('10x15');
    expect(paperSize('Зураг угаалт 10x15')).toBe('10x15');
    expect(paperSize('Зураг угаалт 10х15')).toBe('10x15');
    expect(paperSize('Зураг угаалт 10 × 15')).toBe('10x15');
  });

  it('treats 15x10 and 10x15 as the same size', () => {
    expect(paperSize('Зураг угаалт 15x10')).toBe('10x15');
  });

  it('reads sheet formats in either alphabet', () => {
    expect(paperSize('Бичгийн цаас А4')).toBe('a4');
    expect(paperSize('Бичгийн цаас A4')).toBe('a4');
    expect(paperSize('Фото цаас А3 (2 талтай)')).toBe('a3');
  });

  it('finds no size where a name states none', () => {
    expect(paperSize('Бичиг баримт канон')).toBeNull();
    expect(paperSize('Цээж зураг')).toBeNull();
    expect(paperSize('')).toBeNull();
  });

  it('does not read a weight as a format', () => {
    // «200гр» is not a size, and «А4 200гр» must still read as A4.
    expect(paperSize('Фото цаас А4 200гр')).toBe('a4');
  });
});

/**
 * Deduction happens when an order is saved, so anything booked before the rule
 * existed left the shelf untouched — the order looks normal, the stock looks
 * normal, and only the two together are wrong.
 */
describe('reconcilePaperUsage', () => {
  const shelf = [
    item({ id: 7, name: 'Бичгийн цаас А4', stock: '500' }),
    item({ id: 41, name: 'Фото цаас 10x15', stock: '60' }),
  ];
  const logs = [
    { id: 1, job: 'Зураг угаалт 10*15', quantity: 100, date: '2026-09-19' },
    { id: 2, job: 'Цээж зураг (4ш)', quantity: 4, date: '2026-09-19' },
    { id: 3, job: 'Бичгийн цаас А4 (10ш)', quantity: 10, date: '2026-09-19' },
  ];

  it('lists only the orders that name paper and have no draw', () => {
    expect(pendingPaperLogs(logs, [], shelf).map((log) => log.id)).toEqual([1, 3]);
  });

  it('books the paper those orders missed', () => {
    const out = reconcilePaperUsage([], shelf, logs, 'manager');
    expect(out.inventory.find((row) => row.id === 41)?.stock).toBe('-40');
    expect(out.inventory.find((row) => row.id === 7)?.stock).toBe('490');
    expect(out.drawn).toHaveLength(2);
  });

  it('cannot double-count an order that already has its draw', () => {
    const once = reconcilePaperUsage([], shelf, logs, 'manager');
    const twice = reconcilePaperUsage(once.usage, once.inventory, logs, 'manager');
    expect(twice.inventory.find((row) => row.id === 41)?.stock).toBe('-40');
    expect(twice.drawn).toEqual([]);
  });

  it('is a no-op once nothing is pending', () => {
    const once = reconcilePaperUsage([], shelf, logs, 'manager');
    expect(pendingPaperLogs(logs, once.usage, once.inventory)).toEqual([]);
  });

  it('files each draw on its own order’s day', () => {
    const out = reconcilePaperUsage([], shelf, [
      { id: 9, job: 'Зураг угаалт 10*15', quantity: 5, date: '2026-08-04' },
    ], 'manager');
    expect(out.usage[0]?.date).toBe('2026-08-04');
  });
});
