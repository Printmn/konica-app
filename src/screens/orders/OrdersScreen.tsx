import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, FAB, Icon, Modal, Portal, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import {
  EmptyState,
  OfflineBanner, SyncErrorBanner,
  PermissionDenied,
} from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import {
  applyWorkLogEdit,
  archiveDates,
  boardFilterCounts,
  filterBoard,
  createWorkLog,
  emptyWorkLogForm,
  groupWorkLogsByDate,
  unitPriceOf,
  validateWorkLog,
  visibleWorkLogs,
  workLogToForm,
} from '@/features/worklogs/workLogLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import type { RootStackParamList } from '@/navigation/types';
import { unreadCount as unreadNoticeCount } from '@/features/announcements/announcementLogic';
import { syncPaperUsage, usageForLog } from '@/features/inventory/stockUsage';
import { exportDailyWorkLogs } from '@/services/export/excelService';
import { notifyNewOrder } from '@/services/notifications/notificationService';
import { notifyNewWorkLog } from '@/services/telegram/telegramService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { WorkLogGroup } from '@/features/worklogs/workLogLogic';
import type { BoardFilter } from '@/features/worklogs/workLogLogic';
import type { DocType, WorkLog, WorkLogForm as FormShape, WorkStatus } from '@/types';
import { DAY_LABELS_MN, todayString, weekdayOf } from '@/utils/date';
import { calculateDailyReport, isUnsettled, rawTotal } from '@/features/reports/reportCalculator';
import { formatCurrency } from '@/utils/price';

import { CalculatorTab } from './components/CalculatorTab';
import { ExpensesTab } from './components/ExpensesTab';
import { ArchiveRow } from './components/ArchiveRow';
import { DayTotalsCard } from './components/DayTotalsCard';
import { WorkLogCard } from './components/WorkLogCard';
import { WorkLogForm } from './components/WorkLogForm';

/**
 * Orders — the app's main working screen.
 *
 * Two tabs: the day's work board, and the arithmetic that surrounds it — the
 * square-metre calculator, the day's report and the archive. Booking straight
 * from the catalog used to be a third tab here; it is the Түргэн хэвлэл tab
 * now, and keeping both meant two doors onto the same room.
 *
 * The form draft lives in this screen's state rather than inside the form
 * component, because the original had a real bug here — the 30-second Firebase
 * poll re-rendered the tree, remounted the form, and wiped whatever the user
 * had typed. Hoisting the draft (as the web build eventually did with
 * `wlForm`) is what keeps a half-entered job from vanishing mid-shift.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'worklogs' | 'calculator' | 'expenses';

/** A day heading, or a job under one. */
type BoardRow =
  | { kind: 'header'; group: WorkLogGroup }
  | { kind: 'log'; log: WorkLog; index: number };

/** How long a submit stays locked after a successful save. */
const SUBMIT_LOCK_MS = 1200;

/**
 * The three loose ends, and what each is called on screen.
 *
 * Short labels because four segments have to fit across a phone: the chip says
 * «Аваагүй», the header says «Болсон аваагүй». Both are needed — the chip has
 * room for a word, the header has room for the truth.
 */
/** Reading order: the day's work first, then the three things left over. */
const FILTER_ROWS: readonly (readonly BoardFilter[])[] = [
  ['all', 'notPicked'],
  ['settlement', 'tomorrow'],
];

const FILTERS: Record<
  Exclude<BoardFilter, 'all'>,
  { chip: string; title: string; noun: string; icon: string; emptyHint: string }
> = {
  notPicked: {
    chip: 'Аваагүй',
    title: 'Болсон аваагүй',
    noun: 'аваагүй',
    icon: '📦',
    emptyHint: 'Бүх захиалга хүлээлгэн өгөгдсөн байна',
  },
  settlement: {
    chip: 'Тооцоо',
    title: 'Тооцоотой',
    noun: 'тооцоотой',
    icon: '🧾',
    emptyHint: 'Тооцоо хийгдээгүй захиалга алга',
  },
  tomorrow: {
    chip: 'Маргааш',
    title: 'Маргааш авна',
    noun: 'маргааш',
    icon: '📅',
    emptyHint: 'Хойшлуулсан захиалга алга',
  },
};

export function OrdersScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const navigation = useNavigation<Nav>();
  const { show, showError } = useToast();
  const { can, role, workerName } = useAuth();
  const { gutter } = useResponsive();

  const {
    workLogs,
    setWorkLogs,
    services,
    inventory,
    setInventory,
    usage,
    setUsage,
    calcTypes,
    setCalcTypes,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
    isHydrating,
    announcements,
  } = useData();

  const [tab, setTab] = useState<Tab>('worklogs');
  /**
   * Guards against a double tap booking the same job twice. A ref rather than
   * state: it has to take effect within the same tick, before React re-renders.
   */
  const submitting = useRef(false);
  const listRef = useRef<FlatList<BoardRow>>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormShape>(emptyWorkLogForm);
  /**
   * Bumped every time the form is blanked, and folded into its `key`.
   *
   * The counter iPad keeps this form open, so a reset replaces the values in a
   * component that never unmounts — and the form's intake clock decides whether
   * it may keep ticking by remembering the stamp it last wrote. Remounting is
   * how "this is a different booking now" gets said in a way that reaches that
   * memory; without it, booking one job stops the clock for the next.
   */
  const [formSeq, setFormSeq] = useState(0);
  /** The job being corrected, or `null` when the form is booking a new one. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  /** Which loose end the board is showing, or `all` for the day's work. */
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: number; note: string } | null>(null);

  const { armedId, confirm } = useConfirmAction();

  /** A blank form, and a new identity for it. */
  const resetForm = useCallback(() => {
    setForm(emptyWorkLogForm());
    setFormSeq((previous) => previous + 1);
  }, []);


  /**
   * The iPad opens straight into the form; the manager does not.
   *
   * On the counter iPad the form *is* the screen — somebody is standing there
   * waiting, and a tap on «+» before every order is a tap paid dozens of times
   * a day. The manager opens this tab to look at what is on, so for them the
   * board comes first and the «+» button is one tap when they need it.
   */
  useFocusEffect(
    useCallback(() => {
      setTab('worklogs');
      setEditingId(null);
      setFilter('all');
      if (role === 'ipad') {
        resetForm();
        setShowForm(true);
      } else {
        setShowForm(false);
      }
    }, [role, resetForm]),
  );

  const today = todayString();

  /** Unread notices, badged on the bell in this screen's header. */
  const unreadNotices = useMemo(
    () => unreadNoticeCount(announcements, workerName || role || ''),
    [announcements, workerName, role],
  );

  /**
   * The chip counts, computed whether or not a chip is on.
   *
   * The number is most of the point: a shop with nothing on the shelf and
   * nothing owed should be able to see that without tapping anything.
   */
  const counts = useMemo(() => boardFilterCounts(workLogs), [workLogs]);

  const logs = useMemo(
    () =>
      filter === 'all'
        ? visibleWorkLogs(workLogs, archiveDate, today)
        : filterBoard(workLogs, filter),
    [filter, workLogs, archiveDate, today],
  );

  /**
   * Compact rows, and which way the cards are numbered.
   *
   * A finished day is read rather than worked, so the archive gets the report's
   * one-line rows. A filtered list is the opposite: every row on it is
   * something somebody still has to *do* — chase a customer, take a payment —
   * so it keeps the full card with its status buttons and phone number.
   *
   * Both are fixed lists read top to bottom, so both count up from 1 like the
   * report does, and since a filtered list spans months each card carries its
   * date. Only the live board counts down, so that the newest job keeps its
   * number as work is added underneath it.
   */
  const compact = filter === 'all' && archiveDate !== null;
  const numbered = filter !== 'all' || archiveDate !== null;
  /**
   * The board as a flat list of day headings and cards.
   *
   * Unfinished work is carried forward, so a single column could hold three
   * days at once with no way to tell them apart — the complaint was that
   * nobody could see when a job had come in. Numbering stays global
   * (`total - index`), so a card keeps the same number whichever day it sits
   * under.
   */
  const rows = useMemo((): BoardRow[] => {
    const out: BoardRow[] = [];
    let index = 0;
    for (const group of groupWorkLogsByDate(logs, today)) {
      out.push({ kind: 'header', group });
      for (const log of group.logs) {
        out.push({ kind: 'log', log, index });
        index += 1;
      }
    }
    return out;
  }, [logs, today]);

  const dates = useMemo(() => archiveDates(workLogs), [workLogs]);

  /**
   * How many jobs each archived day holds.
   *
   * The picker used to be a column of bare dates in text buttons, and picking
   * the right one meant guessing from the digits alone — on a tablet held in
   * one hand, with rows barely taller than the text. The count is what makes a
   * day recognisable.
   */
  const archiveCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of workLogs) {
      if (!log.date) continue;
      counts[log.date] = (counts[log.date] ?? 0) + 1;
    }
    return counts;
  }, [workLogs]);
  /**
   * The takings belong to the day the job was booked, not the day it is read.
   *
   * The board deliberately carries unfinished work forward, and the header was
   * summing everything on screen — so a job booked yesterday and still marked
   * «Маргааш авна» had its money counted again today. The daily report and the
   * Excel export were already filtering by date; this was the one place that
   * double-counted, which is worse than being plainly wrong: the two figures
   * disagreed and neither said why.
   *
   * Carried-over rows are still on the board, and still counted — as a
   * separate figure, so it is obvious they are not part of the day's money.
   */
  const dayLogs = useMemo(
    () => logs.filter((log) => log.date === (archiveDate ?? today)),
    [logs, archiveDate, today],
  );
  /**
   * The day's money, split by whether it actually arrived.
   *
   * Work booked «Тооцоотой» is handed over against an invoice, so counting it
   * here said the till held money it did not. It stays on screen — it is owed,
   * not forgotten — but on its own figure.
   */
  const dayTotal = useMemo(
    () => rawTotal(dayLogs.filter((log) => !isUnsettled(log))),
    [dayLogs],
  );
  const dayOwed = useMemo(() => rawTotal(dayLogs.filter(isUnsettled)), [dayLogs]);

  /**
   * The archived day's takings, split by how it was settled.
   *
   * Straight from `calculateDailyReport` — the same function behind the report
   * screen and the Excel export. Summing it again here is how two screens end
   * up disagreeing about a Tuesday.
   */
  const archiveReport = useMemo(
    () => calculateDailyReport(workLogs, archiveDate ?? today),
    [workLogs, archiveDate, today],
  );
  const carriedOver = logs.length - dayLogs.length;

  /**
   * Switching what the board is showing.
   *
   * Shared by all four cells rather than written into each: turning a filter on
   * has three consequences beyond the filter itself, and four copies of them is
   * how one cell quietly stops closing the form.
   */
  const selectFilter = useCallback((next: BoardFilter) => {
    setFilter(next);
    if (next === 'all') return;
    // A filter spans every day, so an archive date underneath it would only
    // contradict the heading.
    setArchiveDate(null);
    // And booking a new job is not what anybody came here to do: these lists
    // are read to chase things already on them. A half-typed draft would also
    // survive the switch and reappear under a heading it has nothing to do
    // with.
    setShowForm(false);
    setEditingId(null);
  }, []);

  /**
   * Keeps the paper shelf in step with an order.
   *
   * Booking «Бичгийн цаас А4 (10ш)» takes ten sheets off; correcting the
   * quantity puts the old draw back before taking the new one; deleting the
   * order returns the paper. All three go through `syncPaperUsage`, which
   * finds the previous automatic row by `logId` — so this cannot double-count,
   * and it never touches a line somebody typed into Зарцуулалт by hand.
   */
  const syncPaper = useCallback(
    (
      logId: number,
      log: { job?: string; quantity?: string | number; date?: string } | null,
    ) => {
      const result = syncPaperUsage(usage, inventory, logId, log, workerName || role || '');
      // Written back only when something moved: an order for a mug must not
      // rewrite the whole inventory collection on every save.
      if (result.drawn === null && usageForLog(usage, logId) === undefined) return null;
      setUsage(() => result.usage);
      setInventory(() => result.inventory);
      return result.drawn;
    },
    [usage, inventory, workerName, role, setUsage, setInventory],
  );

  const canEdit = can('editWorkLogs');
  const canDelete = can('deleteWorkLogs');

  // ── Actions ────────────────────────────────────────────────────────

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  /** Reopens a booked job in the same form it was entered through. */
  const handleEdit = useCallback((log: WorkLog) => {
    setForm(workLogToForm(log));
    setEditingId(log.id);
    setShowForm(true);
    // The form lives above the list. Editing a job from halfway down the board
    // would otherwise open it off-screen and look like nothing happened.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const submitForm = useCallback(() => {
    // A second tap before the form unmounts would book the job twice, and the
    // two would carry different ids so nothing downstream could merge them.
    if (submitting.current) return;

    const error = validateWorkLog(form);
    if (error) {
      show(error, 'error');
      return;
    }

    submitting.current = true;
    setTimeout(() => {
      submitting.current = false;
    }, SUBMIT_LOCK_MS);

    if (editingId !== null) {
      // A correction, not a new job: the row keeps its id, its date and its
      // number for the day, and nothing is notified — the shop was already
      // told about this job when it was booked.
      setWorkLogs((previous) =>
        previous.map((log) => (log.id === editingId ? applyWorkLogEdit(log, form) : log)),
      );
      const edited = workLogs.find((log) => log.id === editingId);
      const drawn = syncPaper(editingId, {
        job: form.job,
        quantity: form.quantity,
        ...(edited?.date === undefined ? {} : { date: edited.date }),
      });
      closeForm();
      show(
        drawn === null ? 'Хадгаллаа' : `Хадгаллаа · ${drawn.name} ${drawn.sheets}ш`,
        'success',
      );
      return;
    }

    const log = createWorkLog(form, workLogs, today);
    setWorkLogs((previous) => [log, ...previous]);
    const drawn = syncPaper(log.id, { job: log.job, quantity: form.quantity, date: log.date });
    closeForm();

    // Alerts are fire-and-forget; a failed notification must not block the save.
    void notifyNewWorkLog(log);
    void notifyNewOrder(log);
    show(
      drawn === null
        ? 'Ажил бүртгэгдлээ'
        : `Ажил бүртгэгдлээ · ${drawn.name} ${drawn.sheets}ш хасагдлаа`,
      'success',
    );
  }, [form, workLogs, today, editingId, setWorkLogs, show, closeForm, syncPaper]);

  const updateLog = useCallback(
    (id: number, patch: Partial<WorkLog>) => {
      setWorkLogs((previous) =>
        previous.map((log) => (log.id === id ? { ...log, ...patch } : log)),
      );
    },
    [setWorkLogs],
  );

  const handleStatusChange = useCallback(
    (id: number, status: WorkStatus) => updateLog(id, { status }),
    [updateLog],
  );

  const handleDelete = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setWorkLogs((previous) => previous.filter((log) => log.id !== confirmedId));
        // Deleting the order returns its paper: a job booked and cancelled
        // must not leave the shelf permanently short.
        const returned = syncPaper(confirmedId, null);
        show(returned === null ? 'Устгалаа' : 'Устгалаа · цаас буцаагдлаа');
      });
    },
    [confirm, setWorkLogs, show, syncPaper],
  );

  const handleCreateDocument = useCallback(
    (log: WorkLog, docType: DocType) => {
      navigation.navigate('Main', {
        screen: 'Quotation',
        params: {
          docType,
          prefill: {
            customer: log.customer || '',
            vatIncluded: Boolean(log.hasVat),
            docType,
            items: [
              {
                name: log.job || '',
                qty: Number(log.quantity) || 1,
                // The unit price, not the line total — see `unitPriceOf`.
                unitPrice: String(unitPriceOf(log)),
              },
            ],
          },
        },
      });
    },
    [navigation],
  );

  const handleCalculatorRegister = useCallback((job: string, price: number) => {
    setForm((previous) => ({
      ...previous,
      job,
      price: String(price),
      unitPrice: String(price),
      quantity: 1,
    }));
    setShowForm(true);
    setTab('worklogs');
  }, []);

  const handleExport = useCallback(async () => {
    const exportDate = archiveDate ?? today;
    const exportLogs = archiveDate
      ? logs
      : workLogs.filter((log) => log.date === today);
    const result = await exportDailyWorkLogs(exportLogs, exportDate);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    // Saving straight into a folder happens silently, so without this the
    // button looks like it did nothing at all.
    show('Excel хадгалагдлаа', 'success');
  }, [archiveDate, today, logs, workLogs, show, showError]);

  // ── Render ─────────────────────────────────────────────────────────

  if (!can('viewOrders')) {
    return (
      <Screen>
        <ScreenHeader title="Захиалга" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Захиалга"
        onBack={onBack}
        subtitle={
          filter !== 'all'
            ? `${FILTERS[filter].title} · ${logs.length} ажил`
            : archiveDate
              ? `Архив · ${archiveDate}`
              : `Өнөөдөр · ${today}`
        }
        // Orders is where the app opens now, so the way into Settings has to
        // live here — it used to hang off the Нүүр screen, which is no longer
        // in the bar.
        right={
          <View style={styles.headerIcons}>
            {/* The staff screen — attendance, the day's spending, the scores.
                It has no tab of its own on this role's bar, and the manager
                lives on this screen, so this is the only place a way in
                actually gets used. */}
            {can('viewAttendance') ? (
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'Staff' })}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Ажилтан"
              >
                <Icon source="account-group" size={22} color="#ffffff" />
              </Pressable>
            ) : null}

            {/* Мэдээлэл. The bell is on the worker's bar but the manager's is
                full, so their way in is here — beside the other two doors this
                screen already holds open. Without it the person who *writes*
                the notices was the only one who could not reach them. */}
            {can('viewAttendance') ? (
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'Notices' })}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={
                  unreadNotices > 0 ? `Мэдээлэл, ${unreadNotices} шинэ` : 'Мэдээлэл'
                }
              >
                <View>
                  <Icon source="bell" size={22} color="#ffffff" />
                  {unreadNotices > 0 ? (
                    <View style={[styles.bellDot, { backgroundColor: theme.colors.error }]} />
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Тохиргоо"
            >
              <Icon source="cog-outline" size={22} color="#ffffff" />
            </Pressable>
          </View>
        }
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <View style={[styles.tabs, { paddingHorizontal: gutter }]}>
        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value)}
          density="small"
          buttons={[
            // Shortened from «Ажлын бүртгэл»: a third segment leaves each one
            // a third of the width, and the longer label clipped mid-word.
            { value: 'worklogs', label: 'Бүртгэл', icon: 'clipboard-text' },
            { value: 'calculator', label: 'Тооцоолол', icon: 'calculator' },
            { value: 'expenses', label: 'Зарлага', icon: 'cash-minus' },
          ]}
        />
      </View>

      {/* The three loose ends, counted — two by two.
          Four across a phone left «Аваагүй 12» three characters wide and the
          count, which is most of the point, was the part that got truncated.
          A 2×2 block gives every cell half the screen. */}
      {tab === 'worklogs' ? (
        <View style={[styles.filterGrid, { paddingHorizontal: gutter }]}>
          {FILTER_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.filterRow}>
              {row.map((key) => {
                const active = filter === key;
                const count = key === 'all' ? null : counts[key];
                return (
                  <Pressable
                    key={key}
                    onPress={() => selectFilter(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.filterCell,
                      {
                        backgroundColor: active
                          ? theme.colors.primary
                          : theme.custom.cardBackground,
                        borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                      },
                      pressed && styles.filterPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterLabel,
                        { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                      ]}
                      numberOfLines={1}
                    >
                      {key === 'all' ? 'Бүгд' : `${FILTERS[key].icon} ${FILTERS[key].chip}`}
                    </Text>
                    {count === null ? null : (
                      <View
                        style={[
                          styles.filterBadge,
                          {
                            backgroundColor: active
                              ? theme.colors.onPrimary
                              : count > 0
                                ? theme.colors.primary
                                : theme.custom.subtleBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterBadgeText,
                            {
                              color: active
                                ? theme.colors.primary
                                : count > 0
                                  ? theme.colors.onPrimary
                                  : theme.custom.mutedText,
                            },
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.body, { paddingHorizontal: gutter }]}>
        {tab === 'worklogs' ? (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(item) =>
              item.kind === 'header' ? `day-${item.group.date}` : String(item.log.id)
            }
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryText, { color: theme.custom.mutedText }]}>
                    {filter !== 'all' ? (
                      // Not a day's takings — the money tied up in whatever the
                      // chip is showing. Counted so the pile has a size.
                      <>
                        {logs.length} {FILTERS[filter].noun} ·{' '}
                        {formatCurrency(rawTotal(logs))}
                      </>
                    ) : (
                      <>
                        {dayLogs.length} ажил · {formatCurrency(dayTotal)}
                        {dayOwed > 0 ? (
                          <Text style={[styles.summaryCarried, { color: theme.colors.error }]}>
                            {'  '}🧾 {formatCurrency(dayOwed)} тооцоотой
                          </Text>
                        ) : null}
                        {carriedOver > 0 ? (
                          <Text style={[styles.summaryCarried, { color: theme.colors.error }]}>
                            {'  '}+{carriedOver} өмнөх захиалга
                          </Text>
                        ) : null}
                      </>
                    )}
                  </Text>
                  <View style={styles.headerActions}>

                    {/* Only the export stays on the board: it sends whatever is
                        on screen. Looking a day up and reading the takings are
                        both questions asked *after* the work, so they moved to
                        the Тооцоолол tab with the rest of the arithmetic. */}
                    {can('exportData') && logs.length > 0 && filter === 'all' ? (
                      <Button
                        mode="text"
                        compact
                        icon="microsoft-excel"
                        onPress={() => void handleExport()}
                      >
                        Excel
                      </Button>
                    ) : null}
                  </View>
                </View>

                {archiveDate ? (
                  <>
                    <Button mode="outlined" compact onPress={() => setArchiveDate(null)}>
                      ← Өнөөдөр рүү буцах
                    </Button>

                    {/* The archive is opened to ask what a past day took, so
                        the answer goes above the rows rather than behind
                        another tab. */}
                    <DayTotalsCard report={archiveReport} date={archiveDate} />
                  </>
                ) : null}

                {filter === 'all' && showForm && canEdit && editingId !== null ? (
                  <Text style={[styles.editingBanner, { color: theme.colors.primary }]}>
                    ✏️ Засварлаж байна — {form.job || 'нэргүй ажил'}
                  </Text>
                ) : null}

                {filter === 'all' && showForm && canEdit ? (
                  <WorkLogForm
                    key={editingId === null ? `new-${formSeq}` : `edit-${editingId}`}
                    form={form}
                    onChange={setForm}
                    onSubmit={submitForm}
                    onCancel={closeForm}
                    services={services}
                    inventory={inventory}
                    submitLabel={editingId === null ? 'Бүртгэх' : 'Хадгалах'}
                    autoTime={editingId === null}
                  />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              isHydrating ? null : (
                <EmptyState
                  icon={filter !== 'all' ? FILTERS[filter].icon : '📋'}
                  title={
                    filter !== 'all'
                      ? `${FILTERS[filter].title} ажил алга`
                      : archiveDate
                        ? 'Энэ өдрийн бүртгэл олдсонгүй'
                        : 'Ажил бүртгэгдээгүй байна'
                  }
                  hint={
                    filter !== 'all'
                      ? FILTERS[filter].emptyHint
                      : canEdit
                        ? 'Доорх + товчоор шинэ ажил нэмнэ үү'
                        : undefined
                  }
                />
              )
            }
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <View style={styles.dayHeader}>
                  <Text
                    style={[
                      styles.dayHeaderText,
                      {
                        // Carried-over days are the ones worth noticing, so
                        // they are the ones that get a colour.
                        color: item.group.overdue ? theme.colors.error : theme.custom.mutedText,
                      },
                    ]}
                  >
                    {item.group.label} · {item.group.logs.length} ажил
                    {item.group.overdue ? ` · ${item.group.pending} хийгдээгүй` : ''}
                  </Text>
                  <View
                    style={[
                      styles.dayHeaderRule,
                      {
                        backgroundColor: item.group.overdue
                          ? theme.colors.error
                          : theme.custom.subtleBorder,
                      },
                    ]}
                  />
                </View>
              ) : compact ? (
                /* A finished day is read rather than worked: the status
                   buttons, the note and the document menu are decisions
                   nobody is still making there. */
                <ArchiveRow
                  log={item.log}
                  ordinal={item.index + 1}
                  today={today}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isDeleteArmed={armedId === item.log.id}
                />
              ) : (
                <WorkLogCard
                  log={item.log}
                  index={item.index}
                  total={logs.length}
                  today={today}
                  {...(numbered ? { ordinal: item.index + 1 } : {})}
                  dateTag={numbered ? item.log.date.slice(5).replace('-', '/') : undefined}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onStatusChange={handleStatusChange}
                  onEditNote={(log) => setNoteDraft({ id: log.id, note: log.note ?? '' })}
                  onEdit={handleEdit}
                  onCreateDocument={handleCreateDocument}
                  onDelete={handleDelete}
                  isDeleteArmed={armedId === item.log.id}
                />
              )
            }
          />
        ) : tab === 'expenses' ? (
          /* The day's spending, against the day's takings. `archiveReport`
             rather than a fresh sum: the figure it subtracts from has to be the
             same one the report and the archive card show, or the shop ends up
             with two versions of what a Tuesday cleared. */
          <ExpensesTab
            date={archiveDate ?? today}
            revenue={archiveReport.totalRevenue}
            by={workerName || role || ''}
            canEdit={canEdit}
          />
        ) : (
          <CalculatorTab
            calcTypes={calcTypes}
            canEdit={can('editCatalog')}
            onSaveTypes={setCalcTypes}
            onRegister={handleCalculatorRegister}
            onOpenReport={
              can('viewReport')
                ? () => navigation.navigate('Main', { screen: 'Report' })
                : undefined
            }
            onOpenArchive={
              can('viewReport') ? () => setArchiveOpen(true) : undefined
            }
            archiveDate={archiveDate}
          />
        )}
      </View>

      {tab === 'worklogs' && filter === 'all' && canEdit && !showForm ? (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => {
            // A clean form every time. The screen no longer wipes it on focus,
            // so without this an abandoned draft would reappear days later.
            setEditingId(null);
            resetForm();
            setShowForm(true);
          }}
          accessibilityLabel="Шинэ ажил нэмэх"
        />
      ) : null}

      <Portal>
        {/* Note editor */}
        <Modal
          visible={noteDraft !== null}
          onDismiss={() => setNoteDraft(null)}
          contentContainerStyle={[
            styles.noteModal,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>💬 Тайлбар</Text>
          <TextInput
            mode="outlined"
            value={noteDraft?.note ?? ''}
            onChangeText={(value) =>
              setNoteDraft((previous) => (previous ? { ...previous, note: value } : previous))
            }
            multiline
            style={styles.noteInput}
            contentStyle={styles.noteInputContent}
            autoFocus
          />
          <View style={styles.noteActions}>
            <Button mode="text" onPress={() => setNoteDraft(null)} style={styles.flex}>
              Болих
            </Button>
            <Button
              mode="contained"
              style={styles.flex}
              onPress={() => {
                if (noteDraft) updateLog(noteDraft.id, { note: noteDraft.note });
                setNoteDraft(null);
              }}
            >
              Хадгалах
            </Button>
          </View>
        </Modal>

        {/* Archive date picker */}
        <Modal
          visible={archiveOpen}
          onDismiss={() => setArchiveOpen(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Архивын өдөр сонгох
          </Text>
          <FlatList
            data={dates}
            keyExtractor={(item) => item}
            style={styles.archiveList}
            ItemSeparatorComponent={() => <View style={styles.archiveGap} />}
            renderItem={({ item }) => {
              const active = archiveDate === item;
              const count = archiveCounts[item] ?? 0;
              return (
                <Pressable
                  onPress={() => {
                    setArchiveDate(item === today ? null : item);
                    setArchiveOpen(false);
                    // The picker is opened from the Тооцоолол tab, but what it
                    // changes is the board — so go and show it.
                    setTab('worklogs');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item}, ${count} захиалга`}
                  style={[
                    styles.archiveRow,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant,
                      borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.archiveDate,
                        { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                      ]}
                    >
                      {item}
                      {item === today ? ' · өнөөдөр' : ''}
                    </Text>
                    <Text
                      style={[
                        styles.archiveMeta,
                        {
                          color: active ? theme.colors.onPrimary : theme.custom.mutedText,
                        },
                      ]}
                    >
                      {DAY_LABELS_MN[weekdayOf(item)] ?? ''} гараг · {count} захиалга
                    </Text>
                  </View>
                  {active ? (
                    <Text style={[styles.archiveTick, { color: theme.colors.onPrimary }]}>✓</Text>
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.custom.mutedText }]}>
                Архив хоосон байна
              </Text>
            }
          />
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingVertical: 10 },
  body: { flex: 1 },
  list: { paddingBottom: 96, gap: 0 },
  listHeader: { gap: 10, paddingBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { fontSize: 12, fontWeight: '700' },
  /** Carried-over work: on the board, but not in the day's money. */
  summaryCarried: { fontSize: 12, fontWeight: '800' },
  headerActions: { flexDirection: 'row' },
  filterGrid: { paddingBottom: 8, gap: 6 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 10,
  },
  filterPressed: { opacity: 0.7 },
  filterLabel: { fontSize: 12, fontWeight: '800' },
  filterBadge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: 'center',
  },
  filterBadgeText: { fontSize: 11, fontWeight: '900' },
  bellDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  separator: { height: 10 },
  /** A day heading: the label, then a rule that runs to the edge. */
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  dayHeaderText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  dayHeaderRule: { flex: 1, height: 1, opacity: 0.6 },
  fab: { position: 'absolute', right: 20, bottom: 24 },
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 12, maxHeight: '75%' },
  /**
   * The note editor gets more room than the other sheets: notes are the one
   * free-text field on an order, and the old box showed about four short lines
   * inside a 16pt-inset card, so anything longer had to be written blind.
   */
  noteModal: {
    marginHorizontal: 8,
    marginVertical: 24,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  noteInput: { minHeight: 200 },
  noteInputContent: { paddingTop: 12 },
  noteActions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  editingBanner: { fontSize: 12, fontWeight: '800', paddingVertical: 4 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  /**
   * Deliberately tall rows. Archive days are picked rarely and usually with a
   * thumb, so the target is sized for that rather than for density.
   */
  archiveList: { maxHeight: 420 },
  archiveGap: { height: 8 },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  archiveDate: { fontSize: 16, fontWeight: '800' },
  archiveMeta: { fontSize: 12, marginTop: 2 },
  archiveTick: { fontSize: 18, fontWeight: '900' },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 12 },
});
