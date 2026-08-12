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
  createWorkLog,
  emptyWorkLogForm,
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
import { exportDailyWorkLogs } from '@/services/export/excelService';
import { notifyNewOrder } from '@/services/notifications/notificationService';
import { notifyNewWorkLog } from '@/services/telegram/telegramService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { DocType, WorkLog, WorkLogForm as FormShape, WorkStatus } from '@/types';
import { DAY_LABELS_MN, todayString, weekdayOf } from '@/utils/date';
import { rawTotal } from '@/features/reports/reportCalculator';
import { formatCurrency } from '@/utils/price';

import { CalculatorTab } from './components/CalculatorTab';
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
type Tab = 'worklogs' | 'calculator';

/** How long a submit stays locked after a successful save. */
const SUBMIT_LOCK_MS = 1200;

export function OrdersScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const navigation = useNavigation<Nav>();
  const { show, showError } = useToast();
  const { can } = useAuth();
  const { gutter } = useResponsive();

  const {
    workLogs,
    setWorkLogs,
    services,
    inventory,
    calcTypes,
    setCalcTypes,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
    isHydrating,
  } = useData();

  const [tab, setTab] = useState<Tab>('worklogs');
  /**
   * Guards against a double tap booking the same job twice. A ref rather than
   * state: it has to take effect within the same tick, before React re-renders.
   */
  const submitting = useRef(false);
  const listRef = useRef<FlatList<WorkLog>>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormShape>(emptyWorkLogForm);
  /** The job being corrected, or `null` when the form is booking a new one. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: number; note: string } | null>(null);

  const { armedId, confirm } = useConfirmAction();

  /**
   * Opening the tab opens the form.
   *
   * Booking a job is what this tab is for — the board was one tap away from
   * every new order, and that tap was being paid dozens of times a day. The
   * form now opens on focus; closing it reveals the board underneath, and the
   * board stays put until the tab is left and come back to.
   */
  useFocusEffect(
    useCallback(() => {
      setTab('worklogs');
      setEditingId(null);
      setForm(emptyWorkLogForm());
      setShowForm(true);
    }, []),
  );

  const today = todayString();
  const logs = useMemo(
    () => visibleWorkLogs(workLogs, archiveDate, today),
    [workLogs, archiveDate, today],
  );
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
  const dayTotal = useMemo(() => rawTotal(logs), [logs]);

  const canEdit = can('editWorkLogs');
  const canDelete = can('deleteWorkLogs');

  // ── Actions ────────────────────────────────────────────────────────

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyWorkLogForm());
  }, []);

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
      closeForm();
      show('Хадгаллаа', 'success');
      return;
    }

    const log = createWorkLog(form, workLogs, today);
    setWorkLogs((previous) => [log, ...previous]);
    closeForm();

    // Alerts are fire-and-forget; a failed notification must not block the save.
    void notifyNewWorkLog(log);
    void notifyNewOrder(log);
    show('Ажил бүртгэгдлээ', 'success');
  }, [form, workLogs, today, editingId, setWorkLogs, show, closeForm]);

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
        show('Устгалаа');
      });
    },
    [confirm, setWorkLogs, show],
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
        subtitle={archiveDate ? `Архив · ${archiveDate}` : `Өнөөдөр · ${today}`}
        // Orders is where the app opens now, so the way into Settings has to
        // live here — it used to hang off the Нүүр screen, which is no longer
        // in the bar.
        right={
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Тохиргоо"
          >
            <Icon source="cog-outline" size={22} color="#ffffff" />
          </Pressable>
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
            { value: 'worklogs', label: 'Ажлын бүртгэл', icon: 'clipboard-text' },
            { value: 'calculator', label: 'Тооцоолол', icon: 'calculator' },
          ]}
        />
      </View>

      <View style={[styles.body, { paddingHorizontal: gutter }]}>
        {tab === 'worklogs' ? (
          <FlatList
            ref={listRef}
            data={logs}
            keyExtractor={(item) => String(item.id)}
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
                    {logs.length} ажил · {formatCurrency(dayTotal)}
                  </Text>
                  <View style={styles.headerActions}>
                    {/* Only the export stays on the board: it sends whatever is
                        on screen. Looking a day up and reading the takings are
                        both questions asked *after* the work, so they moved to
                        the Тооцоолол tab with the rest of the arithmetic. */}
                    {can('exportData') && logs.length > 0 ? (
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
                  <Button mode="outlined" compact onPress={() => setArchiveDate(null)}>
                    ← Өнөөдөр рүү буцах
                  </Button>
                ) : null}

                {showForm && canEdit && editingId !== null ? (
                  <Text style={[styles.editingBanner, { color: theme.colors.primary }]}>
                    ✏️ Засварлаж байна — {form.job || 'нэргүй ажил'}
                  </Text>
                ) : null}

                {showForm && canEdit ? (
                  <WorkLogForm
                    form={form}
                    onChange={setForm}
                    onSubmit={submitForm}
                    onCancel={closeForm}
                    services={services}
                    inventory={inventory}
                    submitLabel={editingId === null ? 'Бүртгэх' : 'Хадгалах'}
                  />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              isHydrating ? null : (
                <EmptyState
                  icon="📋"
                  title={archiveDate ? 'Энэ өдрийн бүртгэл олдсонгүй' : 'Ажил бүртгэгдээгүй байна'}
                  hint={canEdit ? 'Доорх + товчоор шинэ ажил нэмнэ үү' : undefined}
                />
              )
            }
            renderItem={({ item, index }) => (
              <WorkLogCard
                log={item}
                index={index}
                total={logs.length}
                today={today}
                canEdit={canEdit}
                canDelete={canDelete}
                onStatusChange={handleStatusChange}
                onEditNote={(log) => setNoteDraft({ id: log.id, note: log.note ?? '' })}
                onEdit={handleEdit}
                onCreateDocument={handleCreateDocument}
                onDelete={handleDelete}
                isDeleteArmed={armedId === item.id}
              />
            )}
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
            onOpenArchive={() => setArchiveOpen(true)}
            archiveDate={archiveDate}
          />
        )}
      </View>

      {tab === 'worklogs' && canEdit && !showForm ? (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => setShowForm(true)}
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
  headerActions: { flexDirection: 'row' },
  separator: { height: 10 },
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
