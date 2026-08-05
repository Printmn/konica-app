/**
 * Mongolian language helpers for printed documents.
 *
 * An invoice has to carry its amount written out in words — that line is what
 * an accountant checks against the figure, and a bank will query an invoice
 * that lacks it. The grammar here is not decorative: a number word standing
 * before another word takes its attributive form ("дөрвөн", not "дөрөв"), so
 * the tables below are deliberately not the plain cardinals.
 */

export const MONGOLIAN_MONTHS = [
  'Нэгдүгээр',
  'Хоёрдугаар',
  'Гуравдугаар',
  'Дөрөвдүгээр',
  'Тавдугаар',
  'Зургаадугаар',
  'Долоодугаар',
  'Наймдугаар',
  'Есдүгээр',
  'Аравдугаар',
  'Арван нэгдүгээр',
  'Арван хоёрдугаар',
] as const;

/** Attributive forms — these sit in front of another word. */
const UNITS = [
  '',
  'нэг',
  'хоёр',
  'гурван',
  'дөрвөн',
  'таван',
  'зургаан',
  'долоон',
  'найман',
  'есөн',
] as const;

const TENS = [
  '',
  'арван',
  'хорин',
  'гучин',
  'дөчин',
  'тавин',
  'жаран',
  'далан',
  'наян',
  'ерэн',
] as const;

const threeDigits = (n: number): string => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${UNITS[hundreds] ?? ''} зуун`);
  const tens = Math.floor(rest / 10);
  const units = rest % 10;
  if (tens > 0) parts.push(TENS[tens] ?? '');
  if (units > 0) parts.push(UNITS[units] ?? '');
  return parts.join(' ');
};

/**
 * Writes an amount in words: 400000 → «Дөрвөн зуун мянган төгрөг 0 мөнгө».
 *
 * Fractions are not carried: prices in the shop are whole tugriks, and the
 * trailing "0 мөнгө" is the wording the printed form expects.
 */
export const tugrugInWords = (amount: number): string => {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  if (rounded === 0) return 'Тэг төгрөг 0 мөнгө';

  let n = Math.abs(rounded);
  const parts: string[] = [];

  const billions = Math.floor(n / 1_000_000_000);
  n %= 1_000_000_000;
  const millions = Math.floor(n / 1_000_000);
  n %= 1_000_000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;

  if (billions > 0) parts.push(`${threeDigits(billions)} тэрбум`);
  if (millions > 0) parts.push(`${threeDigits(millions)} сая`);
  if (thousands > 0) {
    // "мянган" when it is the last word before төгрөг, "мянга" when more
    // digits follow: «мянган төгрөг» vs «мянга тав зуун».
    parts.push(`${threeDigits(thousands)} ${n === 0 ? 'мянган' : 'мянга'}`);
  }
  if (n > 0) parts.push(threeDigits(n));

  let words = parts.join(' ');
  if (rounded < 0) words = `хасах ${words}`;
  words = words.charAt(0).toUpperCase() + words.slice(1);
  return `${words} төгрөг 0 мөнгө`;
};

/** «2026 оны Наймдугаар сар 4» from an ISO `YYYY-MM-DD` string. */
export const mongolianLongDate = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const year = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  const name = MONGOLIAN_MONTHS[month - 1];
  if (name === undefined) return isoDate;
  return `${year} оны ${name} сар ${day}`;
};

/** «50%», «12.5%» — trims a trailing `.0` so whole percents read cleanly. */
export const percentText = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe) ? `${safe}%` : `${safe.toFixed(1)}%`;
};
