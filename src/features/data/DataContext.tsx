import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { SYNC_INTERVAL_MS } from '@/constants/config';
import {
  attendanceRepository,
  calcTypesRepository,
  colorLabelsRepository,
  employeesRepository,
  announcementsRepository,
  expensesRepository,
  inventoryRepository,
  ordersRepository,
  servicesRepository,
  tasksRepository,
  timeSettingsRepository,
  usageRepository,
  workLogsRepository,
} from '@/firebase/repositories';
import {
  isOnline,
  refreshConnectivity,
  subscribeConnectivity,
} from '@/services/network/connectivity';
import {
  flushQueue,
  hasPendingWrites,
  hydrateQueue,
  subscribeQueue,
} from '@/services/sync/writeQueue';
import type {
  Announcement,
  AttendanceLog,
  CalcType,
  ColorLabel,
  Employee,
  Expense,
  HabitTask,
  InventoryItem,
  Order,
  RemoteKey,
  ServiceItem,
  StockUsage,
  TimeSettings,
  WorkLog,
} from '@/types';
import { logger } from '@/utils/logger';

/**
 * The single source of truth for every persisted collection.
 *
 * The web build kept ~15 `useState` pairs inside `App()`, each wired to its own
 * `toLS(...) + fbWrite(...)` setter. That is reproduced here with the *same*
 * write-through semantics, but centralised so screens no longer receive a dozen
 * setters through props, and so remounts can't lose in-flight edits.
 *
 * Setters accept a value or an updater, exactly like `setState`, because the
 * original code relied on the functional form to avoid stale closures during
 * the 30-second polling cycle.
 */

type Updater<T> = T | ((previous: T) => T);

const resolve = <T,>(updater: Updater<T>, previous: T): T =>
  typeof updater === 'function' ? (updater as (p: T) => T)(previous) : updater;

interface DataState {
  orders: Order[];
  workLogs: WorkLog[];
  attendanceLogs: AttendanceLog[];
  employees: Employee[];
  colorLabels: ColorLabel[];
  calcTypes: CalcType[];
  timeSettings: TimeSettings;
  inventory: InventoryItem[];
  services: ServiceItem[];
  tasks: HabitTask[];
  expenses: Expense[];
  announcements: Announcement[];
  usage: StockUsage[];
}

interface DataContextValue extends DataState {
  isHydrating: boolean;
  isSyncing: boolean;
  isOffline: boolean;
  pendingWrites: number;
  lastSyncedAt: number | null;
  syncError: string | null;

  setOrders: (updater: Updater<Order[]>) => void;
  setWorkLogs: (updater: Updater<WorkLog[]>) => void;
  setAttendanceLogs: (updater: Updater<AttendanceLog[]>) => void;
  setEmployees: (updater: Updater<Employee[]>) => void;
  setColorLabels: (updater: Updater<ColorLabel[]>) => void;
  setCalcTypes: (updater: Updater<CalcType[]>) => void;
  setTimeSettings: (updater: Updater<TimeSettings>) => void;
  setInventory: (updater: Updater<InventoryItem[]>) => void;
  setServices: (updater: Updater<ServiceItem[]>) => void;
  setTasks: (updater: Updater<HabitTask[]>) => void;
  setExpenses: (updater: Updater<Expense[]>) => void;
  setAnnouncements: (updater: Updater<Announcement[]>) => void;
  setUsage: (updater: Updater<StockUsage[]>) => void;

  syncNow: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<DataState>({
    orders: [],
    workLogs: [],
    attendanceLogs: [],
    employees: [],
    colorLabels: [],
    calcTypes: [],
    timeSettings: {
      startTime: '10:00',
      endTime: '18:30',
      penaltyPerMin: 500,
      onTimeScore: 5,
      onLeaveScore: 3,
      workingDays: 22,
    },
    inventory: [],
    services: [],
    tasks: [],
    expenses: [],
    announcements: [],
    usage: [],
  });

  const [isHydrating, setIsHydrating] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  /**
   * Mirrors `state` so the write-through setters can read the freshest value
   * without re-creating themselves on every change (which would remount trees).
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Boot: local cache first so the UI paints instantly ──────────────

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateQueue();
      const [
        orders,
        workLogs,
        attendanceLogs,
        employees,
        colorLabels,
        calcTypes,
        timeSettings,
        inventory,
        services,
        tasks,
        expenses,
        announcements,
        usage,
      ] = await Promise.all([
        ordersRepository.readLocal(),
        workLogsRepository.readLocal(),
        attendanceRepository.readLocal(),
        employeesRepository.readLocal(),
        colorLabelsRepository.readLocal(),
        calcTypesRepository.readLocal(),
        timeSettingsRepository.readLocal(),
        inventoryRepository.readLocal(),
        servicesRepository.readLocal(),
        tasksRepository.readLocal(),
        expensesRepository.readLocal(),
        announcementsRepository.readLocal(),
        usageRepository.readLocal(),
      ]);
      if (cancelled) return;
      setState({
        orders,
        workLogs,
        attendanceLogs,
        employees,
        colorLabels,
        calcTypes,
        timeSettings,
        inventory,
        services,
        tasks,
        expenses,
        announcements,
        usage,
      });
      setIsHydrating(false);
      await refreshConnectivity();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Remote pull ────────────────────────────────────────────────────

  const syncNow = useCallback(async () => {
    if (!isOnline()) {
      setSyncError(null);
      return;
    }
    setIsSyncing(true);
    try {
      // Send anything queued before pulling, so a local edit is not
      // overwritten by a stale server copy.
      await flushQueue();

      const results = await Promise.all([
        ordersRepository.fetchRemote(),
        workLogsRepository.fetchRemote(),
        attendanceRepository.fetchRemote(),
        employeesRepository.fetchRemote(),
        colorLabelsRepository.fetchRemote(),
        calcTypesRepository.fetchRemote(),
        timeSettingsRepository.fetchRemote(),
        inventoryRepository.fetchRemote(),
        servicesRepository.fetchRemote(),
        tasksRepository.fetchRemote(),
        expensesRepository.fetchRemote(),
        announcementsRepository.fetchRemote(),
        usageRepository.fetchRemote(),
      ] as const);

      const [
        orders,
        workLogs,
        attendanceLogs,
        employees,
        colorLabels,
        calcTypes,
        timeSettings,
        inventory,
        services,
        tasks,
        expenses,
        announcements,
        usage,
      ] = results;

      const failed = results.find((r) => !r.ok);
      setSyncError(failed && !failed.ok ? failed.error.message : null);

      /**
       * A collection whose writes have not all landed yet must not be replaced
       * by the server copy — that copy is missing exactly the edit still in the
       * outbox, and adopting it would make the edit disappear from the screen.
       */
      const adoptable = <T,>(
        key: RemoteKey,
        result: { ok: true; value: T | null } | { ok: false; error: unknown },
      ): T | null => (result.ok && result.value && !hasPendingWrites(key) ? result.value : null);

      setState((previous) => {
        const next: DataState = { ...previous };
        next.orders = adoptable('orders', orders) ?? previous.orders;
        next.workLogs = adoptable('worklogs', workLogs) ?? previous.workLogs;
        next.attendanceLogs = adoptable('logs', attendanceLogs) ?? previous.attendanceLogs;
        next.employees = adoptable('employees', employees) ?? previous.employees;
        next.colorLabels = adoptable('colorlabels', colorLabels) ?? previous.colorLabels;
        next.calcTypes = adoptable('calctypes', calcTypes) ?? previous.calcTypes;
        next.timeSettings = adoptable('timesettings', timeSettings) ?? previous.timeSettings;
        next.inventory = adoptable('inventory', inventory) ?? previous.inventory;
        next.services = adoptable('services', services) ?? previous.services;
        next.tasks = adoptable('tasks', tasks) ?? previous.tasks;
        next.expenses = adoptable('expenses', expenses) ?? previous.expenses;
        next.announcements = adoptable('announcements', announcements) ?? previous.announcements;
        next.usage = adoptable('usage', usage) ?? previous.usage;
        return next;
      });

      // Keep the offline cache warm with whatever the server returned.
      await Promise.all([
        orders.ok && orders.value ? ordersRepository.cacheOnly(orders.value) : null,
        workLogs.ok && workLogs.value ? workLogsRepository.cacheOnly(workLogs.value) : null,
        attendanceLogs.ok && attendanceLogs.value
          ? attendanceRepository.cacheOnly(attendanceLogs.value)
          : null,
        employees.ok && employees.value ? employeesRepository.cacheOnly(employees.value) : null,
        colorLabels.ok && colorLabels.value
          ? colorLabelsRepository.cacheOnly(colorLabels.value)
          : null,
        calcTypes.ok && calcTypes.value ? calcTypesRepository.cacheOnly(calcTypes.value) : null,
        timeSettings.ok && timeSettings.value
          ? timeSettingsRepository.cacheOnly(timeSettings.value)
          : null,
        inventory.ok && inventory.value ? inventoryRepository.cacheOnly(inventory.value) : null,
        services.ok && services.value ? servicesRepository.cacheOnly(services.value) : null,
        tasks.ok && tasks.value ? tasksRepository.cacheOnly(tasks.value) : null,
        expenses.ok && expenses.value ? expensesRepository.cacheOnly(expenses.value) : null,
        announcements.ok && announcements.value
          ? announcementsRepository.cacheOnly(announcements.value)
          : null,
        usage.ok && usage.value ? usageRepository.cacheOnly(usage.value) : null,
      ]);

      setLastSyncedAt(Date.now());
    } catch (error) {
      logger.error('syncNow failed', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 30-second polling — same cadence as the web app's `setInterval`.
  useEffect(() => {
    if (isHydrating) return undefined;
    void syncNow();
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isHydrating, syncNow]);

  // Re-sync when the app returns to the foreground; polling is paused while
  // backgrounded, so the first thing a user sees should be fresh.
  useEffect(() => {
    const handler = (status: AppStateStatus): void => {
      if (status === 'active') void syncNow();
    };
    const subscription = AppState.addEventListener('change', handler);
    return () => subscription.remove();
  }, [syncNow]);

  useEffect(() => subscribeConnectivity((online) => setIsOffline(!online)), []);
  useEffect(() => subscribeQueue(setPendingWrites), []);

  // ── Write-through setters ──────────────────────────────────────────

  /**
   * Builds a setter that updates React state, the AsyncStorage cache and the
   * Firebase outbox in one call — the same triple the web app performed inline.
   */
  const makeSetter = useCallback(
    <K extends keyof DataState>(
      key: K,
      // `previous` is handed over too, because the record repositories persist
      // the *difference* between the two arrays rather than the whole thing.
      persist: (previous: DataState[K], next: DataState[K]) => Promise<void>,
    ) =>
      (updater: Updater<DataState[K]>): void => {
        const previous = stateRef.current[key];
        const next = resolve(updater, previous);
        stateRef.current = { ...stateRef.current, [key]: next };
        setState((state) => ({ ...state, [key]: next }));
        void persist(previous, next);
      },
    [],
  );

  const setOrders = useMemo(
    () => makeSetter('orders', (p, v) => ordersRepository.save(p, v)),
    [makeSetter],
  );
  const setWorkLogs = useMemo(
    () => makeSetter('workLogs', (p, v) => workLogsRepository.save(p, v)),
    [makeSetter],
  );
  const setAttendanceLogs = useMemo(
    () => makeSetter('attendanceLogs', (p, v) => attendanceRepository.save(p, v)),
    [makeSetter],
  );
  const setEmployees = useMemo(
    () => makeSetter('employees', (p, v) => employeesRepository.save(p, v)),
    [makeSetter],
  );
  const setColorLabels = useMemo(
    () => makeSetter('colorLabels', (p, v) => colorLabelsRepository.save(p, v)),
    [makeSetter],
  );
  const setCalcTypes = useMemo(
    () => makeSetter('calcTypes', (p, v) => calcTypesRepository.save(p, v)),
    [makeSetter],
  );
  const setTimeSettings = useMemo(
    // Settings are one object with no id, so they stay a whole-node write.
    () => makeSetter('timeSettings', (_p, v) => timeSettingsRepository.save(v)),
    [makeSetter],
  );
  const setInventory = useMemo(
    () => makeSetter('inventory', (p, v) => inventoryRepository.save(p, v)),
    [makeSetter],
  );
  const setServices = useMemo(
    () => makeSetter('services', (p, v) => servicesRepository.save(p, v)),
    [makeSetter],
  );
  const setTasks = useMemo(
    () => makeSetter('tasks', (p, v) => tasksRepository.save(p, v)),
    [makeSetter],
  );
  const setExpenses = useMemo(
    () => makeSetter('expenses', (p, v) => expensesRepository.save(p, v)),
    [makeSetter],
  );
  const setAnnouncements = useMemo(
    () => makeSetter('announcements', (p, v) => announcementsRepository.save(p, v)),
    [makeSetter],
  );
  const setUsage = useMemo(
    () => makeSetter('usage', (p, v) => usageRepository.save(p, v)),
    [makeSetter],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      isHydrating,
      isSyncing,
      isOffline,
      pendingWrites,
      lastSyncedAt,
      syncError,
      setOrders,
      setWorkLogs,
      setAttendanceLogs,
      setEmployees,
      setColorLabels,
      setCalcTypes,
      setTimeSettings,
      setInventory,
      setServices,
      setTasks,
      setExpenses,
      setAnnouncements,
      setUsage,
      syncNow,
    }),
    [
      state,
      isHydrating,
      isSyncing,
      isOffline,
      pendingWrites,
      lastSyncedAt,
      syncError,
      setOrders,
      setWorkLogs,
      setAttendanceLogs,
      setEmployees,
      setColorLabels,
      setCalcTypes,
      setTimeSettings,
      setInventory,
      setServices,
      setTasks,
      setExpenses,
      setAnnouncements,
      setUsage,
      syncNow,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
