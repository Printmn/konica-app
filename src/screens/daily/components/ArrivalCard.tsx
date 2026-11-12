import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Checkbox, Icon, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { Card } from '@/components/ui/Card';
import { ARRIVE_TASK_ID } from '@/constants/config';
import {
  registerArrival,
  registerDeparture,
  totalPossibleScore,
  validateArrival,
} from '@/features/attendance/attendanceLogic';
import { useData } from '@/features/data/DataContext';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import {
  hasClockedIn,
  pendingReminders,
  secondsUntil,
  workedLabel,
} from '@/features/attendance/clockInReminders';
import {
  cancelClockInReminders,
  scheduleClockInReminders,
} from '@/services/notifications/notificationService';
import { nowTimeString, timeToMinutes, todayString } from '@/utils/date';

/**
 * Clocking in: the name, the time, and the day's habits.
 *
 * Lifted out of `DailyScreen` so the staff screen can show the same thing
 * without a second copy. Two copies of a form that decides what people are paid
 * is how the two quietly stop agreeing — one gets the auto-tick fix and the
 * other does not.
 *
 * Self-contained on purpose: it reads its own data and writes its own record,
 * so a screen adds it with `<ArrivalCard />` and nothing else.
 */
export function ArrivalCard(): React.JSX.Element {
  const theme = useAppTheme();
  const { role, workerName, can } = useAuth();
  /** Points are the manager's to read; staff tick, they do not tally. */
  const canViewScores = can('viewScores');
  const { show } = useToast();
  const { employees, tasks, setTasks, attendanceLogs, setAttendanceLogs, timeSettings } =
    useData();

  const [name, setName] = useState(role === 'worker' && workerName ? workerName : '');
  const [arrivalTime, setArrivalTime] = useState(nowTimeString());
  const [doneTaskIds, setDoneTaskIds] = useState<number[]>([]);

  /** Same double-tap guard as the order form; two arrivals would double-score. */
  const submitting = useRef(false);

  /**
   * The clock, kept current while the screen is open.
   *
   * There is no time picker any more. Clocking in means "I am here, now" — an
   * editable field only ever invited a rounder, kinder number, and since these
   * scores feed the monthly bonus that is not a small thing. The displayed
   * time is refreshed on focus and once a minute; the value actually written
   * is read again at the moment of submitting, so a card left open over lunch
   * cannot record a stale arrival.
   */
  useFocusEffect(
    useCallback(() => {
      setArrivalTime(nowTimeString());
      const timer = setInterval(() => setArrivalTime(nowTimeString()), 30_000);
      return () => clearInterval(timer);
    }, []),
  );

  /**
   * Arms the «цагаа бүртгүүлээрэй» nudges, or clears them.
   *
   * Re-run whenever the screen is focused, the shift time changes, or an
   * arrival is recorded. Scheduling is idempotent — the batch is cancelled
   * before it is laid down again — so running it often is cheap and running it
   * rarely is what leaves a stale 09:30 armed after the shift moves.
   *
   * Cleared the moment this person has clocked in. A phone that keeps buzzing
   * after the fact is a phone whose notifications get turned off.
   */
  const armed = role === 'worker' && workerName !== '';
  useEffect(() => {
    if (!armed) return;
    const today = todayString();
    if (hasClockedIn(attendanceLogs, workerName, today)) {
      void cancelClockInReminders();
      return;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const due = pendingReminders(timeSettings.startTime, nowMinutes).map((reminder) => ({
      lead: reminder.lead,
      body: reminder.body,
      seconds: secondsUntil(reminder, nowMinutes, now.getSeconds()),
    }));
    void scheduleClockInReminders(due);
  }, [armed, workerName, attendanceLogs, timeSettings.startTime]);

  /**
   * Today's row for the person holding the phone.
   *
   * Drives the second half of the card: until it exists there is nothing to
   * clock out of, and once it carries a `leaveTime` the day is closed.
   */
  const myLog = useMemo(() => {
    const who = (workerName || name).trim().toLowerCase();
    if (who === '') return undefined;
    const today = todayString();
    return attendanceLogs.find(
      (log) => log.date === today && log.name.trim().toLowerCase() === who,
    );
  }, [attendanceLogs, workerName, name]);

  const clockOut = useCallback(() => {
    // Read at the moment of the tap, like the arrival: the card may have been
    // open since lunch.
    const stamped = nowTimeString();
    const result = registerDeparture(
      attendanceLogs,
      workerName || name,
      todayString(),
      stamped,
      timeSettings,
    );
    if (result.updated === null) {
      show(result.reason ?? 'Бүртгэж чадсангүй', 'error');
      return;
    }
    setAttendanceLogs(() => result.logs);
    show(
      `${result.updated.leaveStatus} · ${workedLabel(
        timeToMinutes(stamped) - timeToMinutes(result.updated.time),
      )} ажиллалаа`,
      result.updated.leftEarly ? 'error' : 'success',
    );
  }, [attendanceLogs, workerName, name, timeSettings, setAttendanceLogs, show]);

  const dailyMax = useMemo(() => totalPossibleScore(tasks), [tasks]);
  const earned = useMemo(
    () =>
      doneTaskIds.reduce((sum, id) => {
        const task = tasks.find((candidate) => candidate.id === id);
        return sum + (task ? task.score || 1 : 0);
      }, 0),
    [doneTaskIds, tasks],
  );

  /** A logged-in worker can only ever register themselves. */
  /**
   * A worker registers themselves and nobody else.
   *
   * `workerName` is now guaranteed non-empty for a worker session — the shared
   * PIN insists on a name — so this is simply `role === 'worker'`. It used to
   * also test for a name, which meant a nameless «Ажилтан» session fell
   * through to the roster picker and could clock in whoever it liked.
   */
  const isOwnName = role === 'worker';

  const toggleTask = useCallback((id: number) => {
    setDoneTaskIds((previous) =>
      previous.includes(id)
        ? previous.filter((candidate) => candidate !== id)
        : [...previous, id],
    );
  }, []);

  const submit = useCallback(() => {
    if (submitting.current) return;

    // Read again rather than trusting the rendered value: the card may have
    // been sitting open since the last render.
    const stamped = nowTimeString();
    const error = validateArrival(name, stamped);
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
      arrivalTime: stamped,
      doneTaskIds,
      tasks,
      timeSettings,
    });

    setAttendanceLogs((previous) => [log, ...previous]);

    // Reflect the auto-tick in the habit list, exactly as the web build did.
    if (!isLate) {
      setTasks((previous) =>
        previous.map((task) => (task.id === ARRIVE_TASK_ID ? { ...task, done: true } : task)),
      );
    }

    setDoneTaskIds(nextDoneTaskIds);
    setArrivalTime(nowTimeString());
    if (role !== 'worker') setName('');
    // The recorded status verbatim, so «· 40 мин эрт» reaches the person who
    // just pressed the button rather than only the manager's list.
    show(`${log.status} — бүртгэгдлээ`, isLate ? 'error' : 'success');
  }, [
    name,
    doneTaskIds,
    tasks,
    timeSettings,
    role,
    setAttendanceLogs,
    setTasks,
    show,
  ]);

  return (
    <Card style={styles.card}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
        ⏰ Ирсэн цаг бүртгэх
      </Text>

      <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>НЭР</Text>

      {isOwnName && workerName === '' ? (
        // Only reachable by a session signed in before the name became
        // compulsory. Says what to do rather than quietly offering the roster.
        <Text style={[styles.hint, { color: theme.colors.error }]}>
          Нэр тодорхойгүй байна — гарч, нэрээ оруулан дахин нэвтэрнэ үү.
        </Text>
      ) : isOwnName ? (
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
                    backgroundColor: active ? theme.colors.primary : theme.custom.cardBackground,
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
        <TextInput mode="outlined" placeholder="Нэр" value={name} onChangeText={setName} dense />
      )}

      <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>ИРСЭН ЦАГ</Text>
      <View
        style={[
          styles.stamp,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.custom.subtleBorder,
          },
        ]}
      >
        <Icon source="clock-outline" size={20} color={theme.colors.primary} />
        <Text style={[styles.stampTime, { color: theme.colors.onSurface }]}>{arrivalTime}</Text>
        <Text style={[styles.stampHint, { color: theme.custom.mutedText }]}>
          Одоогийн цагаар бүртгэгдэнэ
        </Text>
      </View>

      <View style={styles.habitHeader}>
        <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>
          ДАДАЛ & ЦЭВЭРЛЭГЭЭ
        </Text>
        {/* The tally is the manager's to read. Staff still tick — the ticking
            is the record and it still feeds the month — but watching a number
            climb turns habits into a score to game rather than a list to
            do. */}
        {canViewScores ? (
          <Text style={[styles.scoreBadge, { color: theme.colors.primary }]}>
            {earned}/{dailyMax} ⭐
          </Text>
        ) : null}
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
              <Text style={styles.habitType}>{task.type === 'cleaning' ? '🧹' : '⚡'}</Text>
              {/* What each habit is worth is the manager's arithmetic. Printed
                  on every row it turns a list of things to do into a menu
                  priced by effort, and the cheap ones stop getting done. */}
              {canViewScores ? (
                <Text style={styles.habitScore}>+{task.score || 1}⭐</Text>
              ) : null}
            </Pressable>
          );
        })
      )}

      {/* Arriving and leaving are the same card because they are the same
          row in the record — the day is one line, not two — and because the
          person looking for one has no reason to know which screen the other
          lives on. Only one of the three ever shows. */}
      {myLog === undefined ? (
        <Button
          mode="contained"
          icon="clock-check"
          onPress={submit}
          disabled={name.trim() === ''}
        >
          Бүртгэх
        </Button>
      ) : myLog.leaveTime ? (
        <View
          style={[
            styles.stamp,
            {
              backgroundColor: theme.colors.surfaceVariant,
              borderColor: theme.custom.subtleBorder,
            },
          ]}
        >
          <Icon
            source="clock-check-outline"
            size={20}
            color={myLog.leftEarly ? theme.colors.error : theme.colors.primary}
          />
          <Text style={[styles.stampTime, { color: theme.colors.onSurface }]}>
            {myLog.time} – {myLog.leaveTime}
          </Text>
          <Text style={[styles.stampHint, { color: theme.custom.mutedText }]}>
            {myLog.leaveStatus} ·{' '}
            {workedLabel(timeToMinutes(myLog.leaveTime) - timeToMinutes(myLog.time))}
          </Text>
        </View>
      ) : (
        <Button mode="contained" icon="logout" onPress={clockOut}>
          Тарах цагаа бүртгэх
        </Button>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
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
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stampTime: { fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  stampHint: { flex: 1, fontSize: 11, textAlign: 'right' },
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
});
