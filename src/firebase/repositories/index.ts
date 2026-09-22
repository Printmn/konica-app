import {
  CALC_TYPES_DEFAULT,
  COLOR_LABELS_DEFAULT,
  INVENTORY_DEFAULT,
  SERVICES_DEFAULT,
  TASKS_DEFAULT,
  TASK_SCORE_MIGRATION,
  TIME_SETTINGS_DEFAULT,
} from '@/constants/catalogDefaults';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import type {
  Announcement,
  AttendanceLog,
  CalcType,
  ColorLabel,
  Employee,
  Expense,
  StockUsage,
  HabitTask,
  InventoryItem,
  Order,
  ServiceItem,
  TimeSettings,
  WorkLog,
} from '@/types';

import { BaseRepository, isObjectRecord } from './BaseRepository';
import {
  isAnnouncement,
  isAttendanceLog,
  isEmployee,
  isExpense,
  isHabitTask,
  isStockUsage,
  isInventoryItem,
  isOrder,
  isServiceItem,
  isSimpleRecord,
  isWorkLog,
} from './guards';
import { RecordRepository } from './RecordRepository';

/**
 * One repository instance per collection.
 *
 * Two of them carry migrations that the web build ran inline on every render;
 * moving that logic here means it happens once, at load, and is unit-testable.
 */

// ── Migrations lifted from the original App.jsx ──────────────────────

/**
 * Back-fills `category` on inventory rows saved before categories existed.
 * The keyword order is significant and matches the original chain exactly.
 */
export const migrateInventoryCategories = (items: InventoryItem[]): InventoryItem[] =>
  items.map((item) => {
    if (item.category) return item;
    const n = item.name || '';
    if (n.includes('Жааз')) return { ...item, category: 'Жааз' };
    if (n.includes('цаас') || n.includes('Цаас') || n.includes('Фото') || n.includes('Стикер'))
      return { ...item, category: 'Цаас' };
    if (n.includes('Альбом')) return { ...item, category: 'Альбом' };
    if (n.includes('Медаль') || n.includes('Цом')) return { ...item, category: 'Медаль' };
    if (n.includes('Мандат')) return { ...item, category: 'Мандат' };
    if (n.includes('Ламинатор')) return { ...item, category: 'Ламинатор' };
    if (n.includes('хавтас') || n.includes('Хавтас') || n.includes('Хамбан'))
      return { ...item, category: 'Хавтас' };
    if (n.includes('Урилга')) return { ...item, category: 'Урилга' };
    if (n.includes('тууз') || n.includes('Тууз')) return { ...item, category: 'Тууз' };
    if (n.includes('Өргөмжлөл')) return { ...item, category: 'Өргөмжлөл' };
    return { ...item, category: 'Бусад' };
  });

/**
 * Re-applies the current habit scores and splits the old combined
 * "Цагтаа ирэх, тарах" habit (id 4) into id 4 + id 5.
 */
export const migrateTasks = (tasks: HabitTask[]): HabitTask[] => {
  const mapped = tasks.map((task) => {
    if (task.id === 4) return { ...task, text: 'Цагтаа ирэх', score: 3 };
    const score = TASK_SCORE_MIGRATION[task.id];
    return score === undefined ? task : { ...task, score };
  });
  if (!mapped.some((task) => task.id === 5)) {
    mapped.push({ id: 5, text: 'Цагтаа тарах', done: false, type: 'habit', score: 2 });
  }
  return mapped;
};

// ── Guards ───────────────────────────────────────────────────────────

const isTimeSettings = (raw: unknown): raw is TimeSettings =>
  isObjectRecord(raw) && typeof raw.startTime === 'string';

// ── Instances ────────────────────────────────────────────────────────

export const ordersRepository = new RecordRepository<Order>(
  'orders',
  STORAGE_KEYS.orders,
  [],
  isOrder,
);

export const workLogsRepository = new RecordRepository<WorkLog>(
  'worklogs',
  STORAGE_KEYS.workLogs,
  [],
  isWorkLog,
);

export const attendanceRepository = new RecordRepository<AttendanceLog>(
  'logs',
  STORAGE_KEYS.attendanceLogs,
  [],
  isAttendanceLog,
);

export const employeesRepository = new RecordRepository<Employee>(
  'employees',
  STORAGE_KEYS.employees,
  [],
  isEmployee,
);

export const colorLabelsRepository = new RecordRepository<ColorLabel>(
  'colorlabels',
  STORAGE_KEYS.colorLabels,
  [...COLOR_LABELS_DEFAULT],
  isSimpleRecord,
);

export const calcTypesRepository = new RecordRepository<CalcType>(
  'calctypes',
  STORAGE_KEYS.calcTypes,
  [...CALC_TYPES_DEFAULT],
  isSimpleRecord,
);

export const timeSettingsRepository = new BaseRepository<TimeSettings>(
  'timesettings',
  STORAGE_KEYS.timeSettings,
  TIME_SETTINGS_DEFAULT,
  isTimeSettings,
);

export const inventoryRepository = new RecordRepository<InventoryItem>(
  'inventory',
  STORAGE_KEYS.inventory,
  [...INVENTORY_DEFAULT],
  isInventoryItem,
  migrateInventoryCategories,
);

export const servicesRepository = new RecordRepository<ServiceItem>(
  'services',
  STORAGE_KEYS.services,
  [...SERVICES_DEFAULT],
  isServiceItem,
);

export const tasksRepository = new RecordRepository<HabitTask>(
  'tasks',
  STORAGE_KEYS.tasks,
  [...TASKS_DEFAULT],
  isHabitTask,
  migrateTasks,
);

/**
 * The day's spending. No defaults: an empty list is the correct starting
 * state, unlike the catalogs which ship with the shop's real price list.
 */
export const expensesRepository = new RecordRepository<Expense>(
  'expenses',
  STORAGE_KEYS.expenses,
  [],
  isExpense,
);

/** Notices the manager posts for the shop. */
export const announcementsRepository = new RecordRepository<Announcement>(
  'announcements',
  STORAGE_KEYS.announcements,
  [],
  isAnnouncement,
);

/** Sheets drawn off the shelf. Empty is the correct starting state. */
export const usageRepository = new RecordRepository<StockUsage>(
  'usage',
  STORAGE_KEYS.usage,
  [],
  isStockUsage,
);

export { BaseRepository } from './BaseRepository';
export { RecordRepository } from './RecordRepository';
