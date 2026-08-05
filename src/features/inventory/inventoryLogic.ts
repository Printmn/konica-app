import { LOW_STOCK_THRESHOLD } from '@/constants/config';
import type { InventoryItem, ServiceItem } from '@/types';
import { parsePrice } from '@/utils/price';

/**
 * Stock helpers.
 *
 * `stock` is a string in the database (`'22'`, sometimes `''`), so every read
 * goes through `stockCount` rather than trusting the raw field.
 */

/**
 * Reads the stock figure out of whatever the field happens to contain.
 *
 * Stripping every non-digit except `-` left the minus wherever it sat, so a
 * range typed as `"5-10"` became the unparseable `"5-10"` and counted as 0 —
 * an item with ten on the shelf looked out of stock and raised a low-stock
 * warning. The leading digits are what the shop means, so those are used.
 */
export const stockCount = (item: Pick<InventoryItem, 'stock'>): number => {
  const raw = String(item.stock ?? '').trim();
  const match = /^-?\d+/.exec(raw.replace(/[^0-9-]/g, ''));
  return match ? Number(match[0]) || 0 : 0;
};

export const isOutOfStock = (item: InventoryItem): boolean => stockCount(item) <= 0;

export const isLowStock = (item: InventoryItem): boolean => {
  const count = stockCount(item);
  return count > 0 && count <= LOW_STOCK_THRESHOLD;
};

/** Items that need reordering, scarcest first. */
/**
 * Which shelves the list is showing.
 *
 * `low` deliberately excludes what has already run out: "running low" is a
 * reorder list — things still selling that will stop soon — while "out" is a
 * list of what the shop cannot sell today. Lumping them together buries the
 * urgent rows among the ones there is still time for.
 */
export type StockFilter = 'all' | 'low' | 'out';

export const matchesStockFilter = (item: InventoryItem, filter: StockFilter): boolean => {
  if (filter === 'out') return isOutOfStock(item);
  if (filter === 'low') return isLowStock(item);
  return true;
};

export const filterByStock = (
  inventory: readonly InventoryItem[],
  filter: StockFilter,
): InventoryItem[] => inventory.filter((item) => matchesStockFilter(item, filter));

export interface StockCounts {
  all: number;
  low: number;
  out: number;
}

/** The three tallies shown on the filter chips. */
export const stockCounts = (inventory: readonly InventoryItem[]): StockCounts => {
  let low = 0;
  let out = 0;
  for (const item of inventory) {
    if (isOutOfStock(item)) out += 1;
    else if (isLowStock(item)) low += 1;
  }
  return { all: inventory.length, low, out };
};

export const lowStockItems = (inventory: readonly InventoryItem[]): InventoryItem[] =>
  inventory
    .filter((item) => stockCount(item) <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => stockCount(a) - stockCount(b));

/** Total retail value of everything on the shelf. */
export const inventoryValue = (inventory: readonly InventoryItem[]): number =>
  inventory.reduce((sum, item) => sum + parsePrice(item.price) * stockCount(item), 0);

export const searchInventory = (
  inventory: readonly InventoryItem[],
  term: string,
): InventoryItem[] => {
  if (!term.trim()) return [...inventory];
  const needle = term.toLowerCase();
  return inventory.filter((item) => item.name.toLowerCase().includes(needle));
};

export const searchServices = (
  services: readonly ServiceItem[],
  term: string,
): ServiceItem[] => {
  if (!term.trim()) return [...services];
  const needle = term.toLowerCase();
  return services.filter(
    (service) =>
      service.name.toLowerCase().includes(needle) ||
      (service.category || '').toLowerCase().includes(needle),
  );
};

/** Distinct categories in list order, matching `[...new Set(...)]` in the web app. */
export const categoriesOf = (
  items: readonly { category: string }[],
): string[] => [...new Set(items.map((item) => item.category))];
