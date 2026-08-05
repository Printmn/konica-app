import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, FAB, Modal, Portal, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import {
  EmptyState,
  OfflineBanner, SyncErrorBanner,
  PermissionDenied,
} from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import { buildQuickOrder } from '@/features/orders/orderLogic';
import {
  applyWorkLogEdit,
  archiveDates,
  createWorkLog,
  emptyWorkLogForm,
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
import { todayString } from '@/utils/date';
import { rawTotal } from '@/features/reports/reportCalculator';
import { formatCurrency } from '@/utils/price';

import { CalculatorTab } from './components/CalculatorTab';
import { CatalogTab, type QuickOrderDraft } from './components/CatalogTab';
import { WorkLogCard } from './components/WorkLogCard';
import { WorkLogForm } from './components/WorkLogForm';

/**
 * Orders — the app's main working screen.
 *
 * Three tabs, mirroring the web build's `orderTab` switch: the day's work board,
 * the catalog for quick orders, and the square-metre calculator.
 *
 * The form draft lives in this screen's state rather than inside the form
 * component, because the original had a real bug here — the 30-second Firebase
 * poll re-rendered the tree, remounted the form, and wiped whatever the user
 * had typed. Hoisting the draft (as the web build eventually did with
 * `wlForm`) is what keeps a half-entered job from vanishing mid-shift.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'worklogs' | 'catalog' | 'calculator';

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
    setOrders,
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

  const today = todayString();
  const logs = useMemo(
    () => visibleWorkLogs(workLogs, archiveDate, today),
    [workLogs, archiveDate, today],
  );
  const dates = useMemo(() => archiveDates(workLogs), [workLogs]);
  const dayTotal = useMemo(() => rawTotal(logs), [logs]);

  const canEdit = can('editWorkLogs');

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
      navigation.navigate('Quotation', {
        docType,
        prefill: {
          customer: log.customer || '',
          vatIncluded: Boolean(log.hasVat),
          docType,
          items: [
            {
              name: log.job || '',
              qty: Number(log.quantity) || 1,
              unitPrice: log.price || '',
            },
          ],
        },
      });
    },
    [navigation],
  );

  const handleQuickOrder = useCallback(
    (draft: QuickOrderDraft) => {
      if (submitting.current) return;
      submitting.current = true;
      setTimeout(() => {
        submitting.current = false;
      }, SUBMIT_LOCK_MS);

      const { order, workLog } = buildQuickOrder(draft, workLogs);
      setOrders((previous) => [order, ...previous]);
      setWorkLogs((previous) => [workLog, ...previous]);
      void notifyNewOrder(workLog);
      show(`${workLog.job} — ${formatCurrency(order.price)}`, 'success');
      setTab('worklogs');
    },
    [workLogs, setOrders, setWorkLogs, show],
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
    if (!result.ok) showError(result.error);
  }, [archiveDate, today, logs, workLogs, showError]);

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
            { value: 'catalog', label: 'Үйлчилгээ', icon: 'view-grid' },
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
                    {/* The day's takings are the question that follows "what
                        did we book today", so the report sits with the other
                        two rather than a tab away on the home grid. */}
                    {can('viewReport') ? (
                      <Button
                        mode="text"
                        compact
                        icon="chart-box-outline"
                        onPress={() => navigation.navigate('Main', { screen: 'Report' })}
                      >
                        Тайлан
                      </Button>
                    ) : null}
                    <Button
                      mode="text"
                      compact
                      icon="calendar"
                      onPress={() => setArchiveOpen(true)}
                    >
                      Архив
                    </Button>
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
                onStatusChange={handleStatusChange}
                onEditNote={(log) => setNoteDraft({ id: log.id, note: log.note ?? '' })}
                onEdit={handleEdit}
                onCreateDocument={handleCreateDocument}
                onDelete={handleDelete}
                isDeleteArmed={armedId === item.id}
              />
            )}
          />
        ) : tab === 'catalog' ? (
          <CatalogTab services={services} onConfirm={handleQuickOrder} />
        ) : (
          <CalculatorTab
            calcTypes={calcTypes}
            canEdit={can('editCatalog')}
            onSaveTypes={setCalcTypes}
            onRegister={handleCalculatorRegister}
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
            renderItem={({ item }) => (
              <Button
                mode={archiveDate === item ? 'contained' : 'text'}
                onPress={() => {
                  setArchiveDate(item === today ? null : item);
                  setArchiveOpen(false);
                }}
              >
                {item}
                {item === today ? ' (өнөөдөр)' : ''}
              </Button>
            )}
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
  archiveList: { maxHeight: 360 },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 12 },
});
