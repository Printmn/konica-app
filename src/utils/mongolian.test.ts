import { describe, expect, it } from 'vitest';

import { mongolianLongDate, percentText, tugrugInWords } from './mongolian';

/**
 * The written-out amount is the line an accountant reads back against the
 * figure. A wrong word here does not look wrong — it reads as a different sum.
 */
describe('tugrugInWords', () => {
  it('writes a round thousand with the attributive form', () => {
    expect(tugrugInWords(400000)).toBe('Дөрвөн зуун мянган төгрөг 0 мөнгө');
  });

  it('switches to «мянга» when digits follow the thousands', () => {
    expect(tugrugInWords(400500)).toBe('Дөрвөн зуун мянга таван зуун төгрөг 0 мөнгө');
  });

  it('writes a single unit', () => {
    expect(tugrugInWords(1)).toBe('Нэг төгрөг 0 мөнгө');
  });

  it('writes tens and units together', () => {
    expect(tugrugInWords(85)).toBe('Наян таван төгрөг 0 мөнгө');
  });

  it('writes millions and thousands in one phrase', () => {
    expect(tugrugInWords(2_350_000)).toBe('Хоёр сая гурван зуун тавин мянган төгрөг 0 мөнгө');
  });

  it('writes billions', () => {
    expect(tugrugInWords(1_000_000_000)).toBe('Нэг тэрбум төгрөг 0 мөнгө');
  });

  it('has a word for nothing rather than an empty line', () => {
    expect(tugrugInWords(0)).toBe('Тэг төгрөг 0 мөнгө');
  });

  it('marks a negative amount instead of dropping the sign', () => {
    expect(tugrugInWords(-500)).toBe('Хасах таван зуун төгрөг 0 мөнгө');
  });

  it('rounds a fractional amount rather than printing gibberish', () => {
    expect(tugrugInWords(1500.6)).toBe('Нэг мянга таван зуун нэг төгрөг 0 мөнгө');
  });

  it('survives a value that is not a number', () => {
    expect(tugrugInWords(Number.NaN)).toBe('Тэг төгрөг 0 мөнгө');
  });
});

describe('mongolianLongDate', () => {
  it('spells the month out', () => {
    expect(mongolianLongDate('2026-08-04')).toBe('2026 оны Наймдугаар сар 4');
  });

  it('names the two-word months', () => {
    expect(mongolianLongDate('2026-12-31')).toBe('2026 оны Арван хоёрдугаар сар 31');
  });

  it('leaves an unparseable date alone rather than printing NaN', () => {
    expect(mongolianLongDate('өнөөдөр')).toBe('өнөөдөр');
    expect(mongolianLongDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('percentText', () => {
  it('drops the decimal on a whole percent', () => {
    expect(percentText(50)).toBe('50%');
  });

  it('keeps one decimal place when there is a fraction', () => {
    expect(percentText(12.5)).toBe('12.5%');
  });
});
