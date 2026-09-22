import type { InventoryItem } from '@/types';
import { nextId } from '@/utils/id';

/**
 * The shop's standing stock list.
 *
 * Forty rows the counter always carries. Typing them in one at a time on a
 * phone is an hour of work and a handful of typos, so they are kept here and
 * added in one go.
 *
 * This is a *seed*, not the source of truth. Once a row exists in the database
 * it is the database's, and nothing here touches it again — stock counts move
 * every day and must never be reset by a list checked into the code.
 */

interface SeedRow {
  name: string;
  price: string;
  stock: string;
  category: string;
}

const SEED: readonly SeedRow[] = [
  { name: 'Жааз А5', price: '8,500₮', stock: '0', category: 'Жааз' },
  { name: 'Жааз А4 /нарийн/', price: '8,500₮', stock: '0', category: 'Жааз' },
  { name: 'Жааз А4 /хээтэй/', price: '10,000₮', stock: '1', category: 'Жааз' },
  { name: 'Жааз А3', price: '22,000₮', stock: '0', category: 'Жааз' },
  { name: 'Жааз 60х40', price: '35,000₮', stock: '0', category: 'Жааз' },
  { name: 'Жааз 60х80', price: '75,000₮', stock: '0', category: 'Жааз' },

  { name: 'Бичгийн цаас А4', price: '17,000₮', stock: '0', category: 'Цаас' },
  { name: 'Бичгийн цаас А3', price: '35,000₮', stock: '0', category: 'Цаас' },
  { name: 'Фото цаас А4 157гр (2 талтай)', price: '10,000₮', stock: '2', category: 'Цаас' },
  { name: 'Фото цаас А4 200гр (2 талтай)', price: '11,000₮', stock: '15', category: 'Цаас' },
  { name: 'Фото цаас А4 300гр (2 талтай)', price: '12,000₮', stock: '22', category: 'Цаас' },
  { name: 'Фото цаас А3 (2 талтай)', price: '19,000₮', stock: '2', category: 'Цаас' },
  { name: 'Фото шар А4', price: '5,500₮', stock: '2', category: 'Цаас' },
  { name: 'Фото цаас 10x15', price: '1,000₮', stock: '0', category: 'Цаас' },
  { name: 'Фото цаас 16x22', price: '2,500₮', stock: '0', category: 'Цаас' },
  { name: 'Стикер цаас А4 гялгар', price: '11,000₮', stock: '0', category: 'Цаас' },

  { name: 'Цагаан аяга', price: '2,200₮', stock: '0', category: 'Бэлэг дурсгал' },

  { name: 'Ламинатор А4', price: '27,000₮', stock: '0', category: 'Ламинат' },
  { name: 'Ламинатор А3', price: '42,000₮', stock: '0', category: 'Ламинат' },

  { name: 'Өргөмжлөл модон А4', price: '12,000₮', stock: '0', category: 'Өргөмжлөл' },

  { name: 'Мандат гэр оосортой (Саарал/Шар)', price: '2,500₮', stock: '200', category: 'Мандат' },
  { name: 'Мандат гэр өнгөгүй', price: '1,500₮', stock: '170', category: 'Мандат' },

  { name: 'Энгэрийн тууз (Цагаан/Цэнхэр)', price: '1,500₮', stock: '5', category: 'Медаль' },
  { name: 'Медаль Шилэн', price: '3,500₮', stock: '90', category: 'Медаль' },
  { name: 'Медаль Төмөр (Сагс/Волейбол)', price: '3,000₮', stock: '121', category: 'Медаль' },

  { name: 'Улаан хавтас А4', price: '10,000₮', stock: '0', category: 'Хавтас' },
  { name: 'Улаан цэнхэр хавтас А4', price: '12,000₮', stock: '0', category: 'Хавтас' },
  { name: 'Хамбан хавтас А4', price: '10,000₮', stock: '0', category: 'Хавтас' },

  { name: 'Усны сав Балтай', price: '25,000₮', stock: '57', category: 'Бичиг хэрэг' },
  { name: 'Бал Тосон хар', price: '1,500₮', stock: '500', category: 'Бичиг хэрэг' },
  { name: 'Тэмдэглэлийн дэвтэр', price: '7,500₮', stock: '36', category: 'Бичиг хэрэг' },
  { name: 'Усны сав, дэвтэр, балны ком', price: '42,000₮', stock: '64', category: 'Бичиг хэрэг' },

  { name: 'Альбом 800 зураг', price: '80,000₮', stock: '9', category: 'Альбом' },
  { name: 'Альбом 500 зураг', price: '50,000₮', stock: '17', category: 'Альбом' },
  { name: 'Альбом 200 зураг (Арьсан)', price: '32,000₮', stock: '39', category: 'Альбом' },
  { name: 'Альбом 200 зураг (Цэцэгтэй)', price: '27,000₮', stock: '34', category: 'Альбом' },
  { name: 'Альбом 100 зураг', price: '13,000₮', stock: '53', category: 'Альбом' },
  { name: 'Альбом 40 зураг', price: '5,000₮', stock: '43', category: 'Альбом' },

  { name: 'Урилга том', price: '1,500₮', stock: '0', category: 'Урилга' },
  { name: 'Урилга жижиг', price: '1,000₮', stock: '0', category: 'Урилга' },

  { name: 'Номын тавиур 1 үетэй', price: '70,000₮', stock: '0', category: 'Тавиур' },
  { name: 'Номын тавиур 2 үетэй', price: '85,000₮', stock: '0', category: 'Тавиур' },
];

export const SEED_COUNT = SEED.length;

/** Names are compared trimmed and case-folded, as they are elsewhere. */
const key = (name: string): string => name.trim().toLowerCase();

/** How many of the standing rows are not in the list yet. */
export const missingSeedCount = (existing: readonly InventoryItem[]): number => {
  const have = new Set(existing.map((item) => key(item.name)));
  return SEED.filter((row) => !have.has(key(row.name))).length;
};

/**
 * Adds the standing rows that are missing, and only those.
 *
 * A row already in the list is left completely alone — its price may have been
 * changed and its stock certainly has, and overwriting either from a list in
 * the code would quietly undo a day's counting.
 */
export const addMissingSeedItems = (
  existing: readonly InventoryItem[],
  only?: (row: { name: string; category: string }) => boolean,
): InventoryItem[] => {
  const have = new Set(existing.map((item) => key(item.name)));
  const additions = SEED.filter(
    (row) => !have.has(key(row.name)) && (only === undefined || only(row)),
  ).map(
    (row): InventoryItem => ({
      id: nextId(),
      name: row.name,
      price: row.price,
      stock: row.stock,
      category: row.category,
      image: null,
    }),
  );
  return [...existing, ...additions];
};

/**
 * The standing papers, and which of them the shop has not got a row for.
 *
 * A new size added to the seed reaches an existing shop only through this:
 * `SEED` is not the source of truth once the database has rows of its own, so
 * «Фото цаас 10x15» simply never appeared. Offering it on the Зарцуулалт
 * screen, where the gap is noticed, beats sending somebody to Бараа to guess
 * what to type.
 */
const PAPER_SEED = /^(бичгийн\s+цаас\s+[аa]4|фото)/iu;

export const missingPaperNames = (existing: readonly InventoryItem[]): string[] => {
  const have = new Set(existing.map((item) => key(item.name)));
  return SEED.filter((row) => PAPER_SEED.test(row.name) && !have.has(key(row.name))).map(
    (row) => row.name,
  );
};

export const addMissingPapers = (existing: readonly InventoryItem[]): InventoryItem[] =>
  addMissingSeedItems(existing, (row) => PAPER_SEED.test(row.name));
