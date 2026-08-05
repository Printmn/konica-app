import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Checkbox, Icon, Modal, Portal, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { TimeField } from '@/components/ui/TimeField';
import { ARRIVE_TASK_ID } from '@/constants/config';
import {
  registerArrival,
  totalPossibleScore,
  validateArrival,
} from '@/features/attendance/attendanceLogic';
import { useData } from '@/features/data/DataContext';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { HabitTask } from '@/types';
import { nextId } from '@/utils/id';
import { nowTimeString } from '@/utils/date';

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
    setTasks,
    attendanceLogs,
    setAttendanceLogs,
    timeSettings,
    setTimeSettings,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
  } = useData();

  const [name, setName] = useState(role === 'worker' && workerName ? workerName : '');
  const [arrivalTime, setArrivalTime] = useState(nowTimeString());
  const [doneTaskIds, setDoneTaskIds] = useState<number[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskScore, setNewTaskScore] = useState(2);
  const { armedId, confirm } = useConfirmAction();
  /** Same double-tap guard as the order form; two arrivals would double-score. */
  const submitting = useRef(false);
  /** Set once the clerk edits the time, so refocusing does not undo their entry. */
  const timeEdited = useRef(false);

  /**
   * Re-reads the clock every time the screen comes forward.
   *
   * The field was seeded once, at mount. Tab screens stay alive, so someone who
   * opened the app at 09:00 and came back to register at 10:15 was still shown
   * 09:00 — and a late arrival was recorded as on time. Since these scores feed
   * the monthly bonus, a stale default here quietly changes what people are
   * paid. A manual edit is left alone.
   */
  useFocusEffect(
    useCallback(() => {
      if (!timeEdited.current) setArrivalTime(nowTimeString());
    }, []),
  );

  const changeArrivalTime = useCallback((value: string) => {
    timeEdited.current = true;
    setArrivalTime(value);
  }, []);

  const dailyMax = useMemo(() => totalPossibleScore(tasks), [tasks]);
  const earned = useMemo(
    () =>
      doneTaskIds.reduce((sum, id) => {
        const task = tasks.find((candidate) => candidate.id === id);
        return sum + (task ? task.score || 1 : 0);
      }, 0),
    [doneTaskIds, tasks],
  );

  const canManageHabits = can('manageHabits');
  /** A logged-in worker can only ever register themselves. */
  const isOwnName = role === 'worker' && workerName !== '';

  /**
   * Quick picks around the configured shift start. Registering an arrival is
   * overwhelmingly "on time" or "a few minutes late", so those are one tap.
   */
  const arrivalPresets = useMemo(() => {
    const start = timeSettings.startTime;
    const [h, m] = start.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return [start];
    const shift = (minutes: number): string => {
      const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
      const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
      const mm = ((total % 60) + 60) % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    return [shift(-15), start, shift(15), shift(30)];
  }, [timeSettings.startTime]);

  const toggleTask = useCallback((id: number) => {
    setDoneTaskIds((previous) =>
      previous.includes(id)
        ? previous.filter((candidate) => candidate !== id)
        : [...previous, id],
    );
  }, []);

  const submit = useCallback(() => {
    if (submitting.current) return;

    const error = validateArrival(name, arrivalTime);
    if (error) {
      show(error, 'error');
      return;
    }

    submitting.current = true;
    setTimeout(() => {
      submitting.current = false;
    }, 1200);

    const { log, nextDoneTaskIds, isLate } = registerArrival({
      name: name.trim(),
      arrivalTime,
      doneTaskIds,
      tasks,
      timeSettings,
    });

    setAttendanceLogs((previous) => [log, ...previous]);

    // Reflect the auto-tick in the habit list, exactly as the web build did.
    if (!isLate) {
      setTasks((previous) =>
        previous.map((task) =>
          task.id === ARRIVE_TASK_ID ? { ...task, done: true } : task,
        ),
      );
    }

    setDoneTaskIds(nextDoneTaskIds);
    timeEdited.current = false;
    setArrivalTime(nowTimeString());
    if (role !== 'worker') setName('');
    show(
      isLate ? `${log.status} — бүртгэгдлээ` : 'Цагтаа ирсэн — бүртгэгдлээ',
      isLate ? 'error' : 'success',
    );
  }, [
    name,
    arrivalTime,
    doneTaskIds,
    tasks,
    timeSettings,
    role,
    setAttendanceLogs,
    setTasks,
    show,
  ]);

  const addTask = useCallback(() => {
    if (!newTaskText.trim()) return;
    const task: HabitTask = {
      id: nextId(),
      text: newTaskText.trim(),
      done: false,
      type: 'habit',
      score: newTaskScore,
    };
    setTasks((previous) => [...previous, task]);
    setNewTaskText('');
    setNewTaskScore(2);
  }, [newTaskText, newTaskScore, setTasks]);

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
        subtitle={`Эхлэх цаг: ${timeSettings.startTime}`}
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
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            ⏰ Ирсэн цаг бүртгэх
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>НЭР</Text>

          {isOwnName ? (
            // A worker registers only themselves; showing a picker would just
            // invite them to clock somebody else in.
            <View
              style={[
                styles.lockedName,
                {
                  backgroundColor: theme.colors.primaryContainer,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <Icon source="account-check" size={18} color={theme.colors.primary} />
              <Text style={[styles.lockedNameText, { color: theme.colors.onPrimaryContainer }]}>
                {workerName}
              </Text>
            </View>
          ) : employees.length > 0 ? (
            <View style={styles.nameRow}>
              {employees.map((employee) => {
                const active = name === employee.name;
                return (
                  <Pressable
                    key={employee.id}
                    onPress={() => setName(active ? '' : employee.name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.nameChip,
                      {
                        backgroundColor: active
                          ? theme.colors.primary
                          : theme.custom.cardBackground,
                        borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                      },
                      pressed && styles.namePressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.nameChipText,
                        { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                      ]}
                      numberOfLines={1}
                    >
                      {employee.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            // No roster yet — typing is better than being unable to register.
            <TextInput
              mode="outlined"
              placeholder="Нэр"
              value={name}
              onChangeText={setName}
              dense
            />
          )}

          {/* The shift start is the answer almost every time, so it leads. */}
          <TimeField
            label="ИРСЭН ЦАГ"
            value={arrivalTime}
            onChange={changeArrivalTime}
            presets={arrivalPresets}
          />

          <View style={styles.habitHeader}>
            <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>
              ДАДАЛ & ЦЭВЭРЛЭГЭЭ
            </Text>
            <Text style={[styles.scoreBadge, { color: theme.colors.primary }]}>
              {earned}/{dailyMax} ⭐
            </Text>
          </View>

          {tasks.length === 0 ? (
            <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
              Дадал бүртгэгдээгүй байна
            </Text>
          ) : (
            tasks.map((task) => {
              const checked = doneTaskIds.includes(task.id);
              return (
                <Pressable
                  key={task.id}
                  onPress={() => toggleTask(task.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  style={[
                    styles.habitRow,
                    {
                      backgroundColor: checked ? '#dcfce7' : theme.colors.surfaceVariant,
                      borderColor: checked ? '#86efac' : theme.custom.subtleBorder,
                    },
                  ]}
                >
                  <Checkbox status={checked ? 'checked' : 'unchecked'} />
                  <Text
                    style={[
                      styles.habitText,
                      {
                        color: checked ? '#166534' : theme.colors.onSurface,
                        textDecorationLine: checked ? 'line-through' : 'none',
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {task.text}
                  </Text>
                  <Text style={styles.habitType}>
                    {task.type === 'cleaning' ? '🧹' : '⚡'}
                  </Text>
                  <Text style={styles.habitScore}>+{task.score || 1}⭐</Text>
                </Pressable>
              );
            })
          )}

          <Button
            mode="contained"
            icon="clock-check"
            onPress={submit}
            disabled={name.trim() === ''}
          >
            Бүртгэх
          </Button>
        </Card>

        {canManageHabits ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              ➕ Дадал нэмэх
            </Text>
            <TextInput
              mode="outlined"
              label="Ажлын нэр"
              value={newTaskText}
              onChangeText={setNewTaskText}
              dense
            />
            <View style={styles.scoreRow}>
              <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>Оноо</Text>
              {[1, 2, 3, 4, 5].map((score) => (
                <Pressable
                  key={score}
                  onPress={() => setNewTaskScore(score)}
                  accessibilityRole="button"
                  style={[
                    styles.scoreDot,
                    {
                      backgroundColor:
                        newTaskScore === score ? '#f59e0b' : theme.custom.cardBackground,
                      borderColor: newTaskScore === score ? '#f59e0b' : theme.colors.outline,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreDotText,
                      { color: newTaskScore === score ? '#ffffff' : theme.custom.mutedText },
                    ]}
                  >
                    {score}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button mode="contained-tonal" onPress={addTask} disabled={!newTaskText.trim()}>
              Нэмэх
            </Button>
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
  deleteIcon: { fontSize: 14, opacity: 0.4 },
  deleteArmed: { fontSize: 10, fontWeight: '900', color: '#dc2626' },
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
});
