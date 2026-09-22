import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Modal, Portal, ProgressBar, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { TimeField } from '@/components/ui/TimeField';

import { useData } from '@/features/data/DataContext';
import { DEFAULT_END } from '@/features/attendance/clockInReminders';
import { calculatePerformance } from '@/features/performance/bonusCalculator';

import { AttendanceChartCard } from './components/AttendanceChartCard';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatCurrency } from '@/utils/price';
import { currentMonthString, monthLabel } from '@/utils/date';

import { ArrivalCard } from './components/ArrivalCard';
import { HabitAdminCard } from './components/HabitAdminCard';

/**
 * Attendance and habits.
 *
 * All of the arithmetic — lateness, the auto-tick of "Цагтаа ирэх", the earned
 * score — lives in `attendanceLogic`, so this screen only collects input and
 * renders results. That separation matters because these scores feed directly
 * into the monthly bonus.
 */

export function DailyScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { role, workerName, can } = useAuth();
  const { show } = useToast();
  const { gutter } = useResponsive();

  const {
    employees,
    tasks,
    attendanceLogs,
    setAttendanceLogs,
    timeSettings,
    setTimeSettings,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
  } = useData();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const canManageHabits = can('manageHabits');
  const canViewScores = can('viewScores');

  /** Only a person signed in as themselves may record an arrival. */
  const canRegister = role === 'worker';

  const { armedId, confirm } = useConfirmAction();

  /**
   * This month's bonus, alongside the habits that earn it.
   *
   * It used to live on a screen of its own that nobody could reach. Ticking a
   * habit and seeing what that habit is worth belong on the same screen —
   * splitting them made the score feel arbitrary.
   */
  const month = currentMonthString();
  const performance = useMemo(
    () =>
      calculatePerformance({
        month,
        attendanceLogs,
        employees,
        tasks,
        maxBonus: timeSettings.maxBonus,
      }),
    [month, attendanceLogs, employees, tasks, timeSettings.maxBonus],
  );
  /** A worker sees only their own row; a manager sees the whole shop. */
  const bonusRows = useMemo(
    () =>
      role === 'worker' && workerName
        ? performance.filter((entry) => entry.name === workerName)
        : performance,
    [performance, role, workerName],
  );

  const deleteLog = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setAttendanceLogs((previous) => previous.filter((log) => log.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setAttendanceLogs, show],
  );

  const todayLogs = attendanceLogs.slice(0, 40);

  return (
    <Screen>
      <ScreenHeader
        title="Цаг & Дадал"
        onBack={onBack}
        subtitle={`${timeSettings.startTime} – ${timeSettings.endTime ?? DEFAULT_END}`}
        right={
          can('changeSettings') ? (
            <Button
              mode="text"
              compact
              textColor="#ffffff"
              icon="cog"
              onPress={() => setSettingsOpen(true)}
            >
              Тохиргоо
            </Button>
          ) : undefined
        }
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Clocking in is something a person does for themselves.
            The manager reads this screen; letting them tick somebody else's
            arrival is how a time sheet stops meaning anything. */}
        {/* Clocking in is something a person does for themselves. The
            manager reads this screen; letting them tick somebody else's
            arrival is how a time sheet stops meaning anything. */}
        {canRegister ? <ArrivalCard /> : null}

        {canManageHabits ? <HabitAdminCard /> : null}

        {/* Points and the money they come to are the manager's to read. Staff
            still tick their habits — the ticking is the record — but a running
            total on a shared shop floor turns a quiet measure into a public
            league table, which is not what it was for. */}
        {/* The shape of the month, not another table of it. */}
        {canViewScores ? <AttendanceChartCard performance={performance} /> : null}

        {canViewScores ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              🏅 Урамшуулал · {monthLabel(month)}
            </Text>
            {bonusRows.length === 0 ? (
              <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                Энэ сард бүртгэл алга. Ирцээ тэмдэглэсний дараа оноо цуглана.
              </Text>
            ) : (
              bonusRows.map((entry) => (
                <View key={entry.name} style={styles.bonusRow}>
                  <View style={styles.flex}>
                    <Text style={[styles.logName, { color: theme.colors.onSurface }]}>
                      {entry.name}
                    </Text>
                    <Text style={[styles.logTasks, { color: theme.custom.mutedText }]}>
                      {entry.score}/{entry.maxScore} оноо · {entry.days} өдөр ·{' '}
                      {entry.late} хоцорсон
                    </Text>
                    <ProgressBar
                      progress={entry.pct}
                      color="#16a34a"
                      style={styles.bonusBar}
                    />
                  </View>
                  <View style={styles.bonusAmount}>
                    <Text style={[styles.bonusValue, { color: theme.colors.primary }]}>
                      {formatCurrency(entry.bonus)}
                    </Text>
                    <Text style={[styles.logTasks, { color: theme.custom.mutedText }]}>
                      {Math.round(entry.pct * 100)}%
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null}

        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
          📋 Бүртгэлийн түүх
        </Text>

        {todayLogs.length === 0 ? (
          <EmptyState icon="🕐" title="Бүртгэл алга" />
        ) : (
          todayLogs.map((log) => (
            <Card key={log.id} accentColor={log.isLate ? '#fecaca' : '#bbf7d0'}>
              <View style={styles.logRow}>
                <Text style={styles.logIcon}>{log.isLate ? '⏰' : '✓'}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.logName, { color: theme.colors.onSurface }]}>
                    {log.name}
                  </Text>
                  <Text style={[styles.logStatus, { color: log.isLate ? '#dc2626' : '#16a34a' }]}>
                    {log.status} · {log.date}
                  </Text>
                  {log.completedTaskCount > 0 ? (
                    <Text style={[styles.logTasks, { color: theme.custom.mutedText }]}>
                      ✓ {log.completedTaskCount}/{log.totalTaskCount} ажил ·{' '}
                      {log.completedScore || 0} оноо
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.logTime, { color: theme.colors.onSurface }]}>
                  {log.time}
                </Text>
                {can('manageEmployees') ? (
                  <Pressable
                    onPress={() => deleteLog(log.id)}
                    hitSlop={10}
                    accessibilityLabel="Устгах"
                  >
                    <Text style={armedId === log.id ? styles.deleteArmed : styles.deleteIcon}>
                      {armedId === log.id ? 'Устгах?' : '🗑'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={settingsOpen}
          onDismiss={() => setSettingsOpen(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            ⚙️ Цагийн тохиргоо
          </Text>
          <TimeField
            label="АЖИЛ ЭХЛЭХ ЦАГ"
            value={timeSettings.startTime}
            onChange={(value) =>
              setTimeSettings((previous) => ({ ...previous, startTime: value }))
            }
            presets={['09:00', '09:30', '10:00', '11:00']}
          />
          <TimeField
            label="АЖИЛ ТАРАХ ЦАГ"
            value={timeSettings.endTime ?? DEFAULT_END}
            onChange={(value) =>
              setTimeSettings((previous) => ({ ...previous, endTime: value }))
            }
            presets={['18:00', '18:30', '19:00', '20:00']}
          />
          <TextInput
            mode="outlined"
            label="Сарын ажлын өдөр"
            value={String(timeSettings.workingDays ?? 22)}
            onChangeText={(value) =>
              setTimeSettings((previous) => ({
                ...previous,
                workingDays: Number(value) || 22,
              }))
            }
            keyboardType="number-pad"
            dense
          />
          <Button mode="contained" onPress={() => setSettingsOpen(false)}>
            Хаах
          </Button>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 12, gap: 12, paddingBottom: 40 },
  card: { gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  nameChipText: { fontSize: 13, fontWeight: '800' },
  namePressed: { opacity: 0.7 },
  lockedName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  lockedNameText: { fontSize: 14, fontWeight: '800' },
  habitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scoreBadge: { fontSize: 12, fontWeight: '900' },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 10,
  },
  habitText: { flex: 1, fontSize: 12, fontWeight: '700' },
  habitType: { fontSize: 12 },
  habitScore: { fontSize: 10, fontWeight: '900', color: '#f59e0b' },
  hint: { fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDotText: { fontSize: 12, fontWeight: '900' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logIcon: { fontSize: 20 },
  logName: { fontSize: 13, fontWeight: '800' },
  logStatus: { fontSize: 11, fontWeight: '700' },
  logTasks: { fontSize: 10, marginTop: 2 },
  logTime: { fontSize: 14, fontWeight: '900' },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  bonusBar: { height: 6, borderRadius: 999, marginTop: 6 },
  bonusAmount: { alignItems: 'flex-end' },
  bonusValue: { fontSize: 15, fontWeight: '900' },
  deleteIcon: { fontSize: 14, opacity: 0.4 },
  deleteArmed: { fontSize: 10, fontWeight: '900', color: '#dc2626' },
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
});
