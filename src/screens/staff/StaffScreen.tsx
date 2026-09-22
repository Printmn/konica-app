import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import {
  EXPENSE_CATEGORIES,
  byCategory,
  categoryLabel,
  createExpense,
  dailyBars,
  byPerson,
  inWindow,
  onDay,
  sumOf,
  timeOf,
  validateExpense,
  windowTotal,
} from '@/features/expenses/expenseLogic';
import {
  calculatePerformance,
  dailyMaxScore,
} from '@/features/performance/bonusCalculator';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useToast } from '@/hooks/useToast';
import type { RootStackParamList } from '@/navigation/types';
import { ArrivalCard } from '@/screens/daily/components/ArrivalCard';
import { HabitAdminCard } from '@/screens/daily/components/HabitAdminCard';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ExpenseCategory } from '@/types';
import { currentMonthString, timeToMinutes, todayString } from '@/utils/date';
import { formatCurrency } from '@/utils/price';

import { workedLabel } from '@/features/attendance/clockInReminders';

import { ProfileTab } from './components/ProfileTab';

/**
 * Ажилтан — everything about the people rather than the printing.
 *
 * The shop's staff features already existed but had no door: attendance and
 * habits on one screen, the monthly bonus on another, and no way to reach
 * either. This is that door, plus the two things that were missing — what the
 * day cost in lunch and water, and where each person's score stands.
 *
 * Spending is deliberately *not* folded into the daily report. That report
 * answers "what came in today" and is reconciled against the till; a lunch
 * receipt in it would quietly change a number people trust.
 */

type Tab = 'expenses' | 'score' | 'profile';

/**
 * Sentinel id for the sign-out confirmation.
 *
 * `useConfirmAction` arms one id at a time, and every other armed thing on
 * this screen is an expense — whose ids are millisecond timestamps, so a
 * negative number can never collide with one.
 */
const LOGOUT_ID = -1;

export function StaffScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const { workerName, displayName, role, logout, can } = useAuth();
  const { gutter } = useResponsive();
  const { armedId, confirm } = useConfirmAction();

  const {
    expenses,
    setExpenses,
    attendanceLogs,
    employees,
    tasks,
    timeSettings,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
  } = useData();

  const [tab, setTab] = useState<Tab>('expenses');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const today = todayString();

  const bars = useMemo(() => dailyBars(expenses, { today }), [expenses, today]);
  const todaysExpenses = useMemo(() => onDay(expenses, today), [expenses, today]);
  const todaysTotal = sumOf(todaysExpenses);
  const weekTotal = windowTotal(bars);
  const legend = useMemo(() => byCategory(todaysExpenses), [todaysExpenses]);

  /**
   * Who spent the week's money.
   *
   * Taken over the whole seven days the chart covers rather than just today —
   * one person buying lunch on Monday and another on Tuesday is the pattern
   * worth seeing, and a single day hides it.
   */
  const spenders = useMemo(() => byPerson(inWindow(expenses, bars)), [expenses, bars]);

  const performance = useMemo(
    () =>
      calculatePerformance({
        month: currentMonthString(),
        attendanceLogs,
        employees,
        tasks,
        maxBonus: timeSettings.maxBonus,
      }),
    [attendanceLogs, employees, tasks, timeSettings.maxBonus],
  );
  const dailyMax = useMemo(() => dailyMaxScore(tasks), [tasks]);

  /**
   * Who came in today, and when.
   *
   * The manager's first question of the morning, and until now it could only
   * be answered by opening the attendance screen and reading a month. Sorted by
   * arrival, so the list reads like the door.
   */
  /**
   * Faces, by name.
   *
   * An attendance log records who arrived as free text, so the only way back
   * to their photo is the name — the same trick the order board uses for
   * product pictures.
   */
  const facesByName = useMemo(() => {
    const faces = new Map<string, string>();
    for (const employee of employees) {
      if (employee.photo) faces.set(employee.name.trim().toLowerCase(), employee.photo);
    }
    return faces;
  }, [employees]);
  const faceOf = (name: string): string | undefined =>
    facesByName.get(name.trim().toLowerCase());

  const todaysArrivals = useMemo(
    () =>
      attendanceLogs
        .filter((log) => log.date === today)
        .sort((a, b) => (a.time < b.time ? -1 : 1)),
    [attendanceLogs, today],
  );
  /** The signed-in worker's own row, when there is one to find. */
  const mine = performance.find((entry) => entry.name === workerName);
  /**
   * Scores and bonus are the manager's to read.
   *
   * Staff go on ticking habits — that is the record, and it still feeds the
   * month — but the points and the money stay off their screen.
   */
  const canViewScores = can('viewScores');

  const addExpense = useCallback(() => {
    const draft = { category, amount, note, by: workerName || role || '' };
    const problem = validateExpense(draft);
    if (problem !== null) {
      show(problem, 'error');
      return;
    }

    setExpenses((previous) => [createExpense(draft), ...previous]);
    setAmount('');
    setNote('');
    show('Зарлага бүртгэгдлээ', 'success');
  }, [category, amount, note, workerName, role, setExpenses, show]);

  const removeExpense = useCallback(
    (id: number) => {
      setExpenses((previous) => previous.filter((expense) => expense.id !== id));
      show('Устгалаа', 'success');
    },
    [setExpenses, show],
  );

  /**
   * Staff record spending; the manager reads it.
   *
   * The entry form is hidden from anyone who is not clocked in as a person,
   * because an expense signed «manager» tells nobody anything — and the manager
   * opens this screen to check what was spent, not to spend.
   */
  const canRecord = role === 'worker';

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.subtleBorder },
  ];

  return (
    <Screen>
      <ScreenHeader
        title="Ажилтан"
        onBack={onBack}
        // Who is signed in. On a shared device this is the only thing that
        // says whose attendance and whose score is on screen.
        subtitle={workerName || displayName}
        right={
          // Only staff sign out from here. The manager's way out is in
          // Settings, where the rest of their session lives.
          role === 'worker' ? (
            <Pressable
              onPress={() => confirm(LOGOUT_ID, () => void logout())}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Гарах"
            >
              <Text style={styles.logout}>
                {armedId === LOGOUT_ID ? 'Гарах уу?' : 'Гарах'}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? <SyncErrorBanner onRetry={() => void syncNow()} /> : null}

      <View style={[styles.tabs, { paddingHorizontal: gutter }]}>
        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          density="small"
          buttons={[
            { value: 'expenses', label: 'Зарлага', icon: 'cash-minus' },
            { value: 'score', label: 'Цаг бүртгэл', icon: 'clock-outline' },
            // Staff reach their own profile from the bar; this sub-tab is the
            // manager's way to any of them, so it only appears for them.
            ...(can('manageEmployees')
              ? [{ value: 'profile', label: 'Мэдээлэл', icon: 'account-details' }]
              : []),
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tab === 'expenses' ? (
          <>
            {/* Recording is the counter's job; the manager only reads. */}
            {canRecord ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  ӨНӨӨДРИЙН ЗАРЛАГА
                </Text>

                <View style={styles.categoryRow}>
                  {EXPENSE_CATEGORIES.map((item) => {
                    const active = category === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => setCategory(item.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active
                              ? theme.custom.selected
                              : theme.custom.cardBackground,
                            borderColor: active
                              ? theme.custom.selected
                              : theme.custom.subtleBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? theme.custom.onSelected : theme.colors.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.split}>
                  <TextInput
                    mode="outlined"
                    label="Дүн (₮)"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    style={styles.flex}
                    dense
                  />
                  <TextInput
                    mode="outlined"
                    label="Тайлбар"
                    value={note}
                    onChangeText={setNote}
                    style={styles.flex}
                    dense
                  />
                </View>

                <Button mode="contained" icon="plus" onPress={addExpense} style={styles.spaced}>
                  Нэмэх
                </Button>
              </View>
            ) : null}

            {/* A bar per day for the last week. Drawn with plain views rather
                than a charting library: seven bars do not justify 200KB of
                bundle on a phone that also has to open PDFs. */}
            <View style={cardStyle}>
              <View style={styles.chartHead}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  СҮҮЛИЙН 7 ХОНОГ
                </Text>
                <Text style={[styles.chartTotal, { color: theme.colors.primary }]}>
                  {formatCurrency(weekTotal)}
                </Text>
              </View>

              <View style={styles.chart}>
                {bars.map((bar) => (
                  <View key={bar.date} style={styles.barSlot}>
                    <Text style={[styles.barValue, { color: theme.custom.mutedText }]}>
                      {bar.total > 0 ? Math.round(bar.total / 1000) : ''}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            // A day with spending always shows something, so an
                            // 800₮ day beside a 40,000₮ one is still visible.
                            height: `${Math.max(bar.height * 100, bar.total > 0 ? 6 : 0)}%`,
                            backgroundColor: bar.isToday
                              ? theme.colors.primary
                              : theme.custom.selected,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barLabel,
                        {
                          color: bar.isToday ? theme.colors.primary : theme.custom.mutedText,
                          fontWeight: bar.isToday ? '900' : '700',
                        },
                      ]}
                    >
                      {bar.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                Тоонууд мянган төгрөгөөр. Өнөөдөр: {formatCurrency(todaysTotal)}
              </Text>
            </View>

            {legend.length > 0 ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  ӨНӨӨДӨР ЮУНД
                </Text>
                {legend.map((row) => (
                  <View key={row.key} style={styles.legendRow}>
                    <Text style={[styles.legendLabel, { color: theme.colors.onSurface }]}>
                      {row.label}
                    </Text>
                    <Text style={[styles.legendValue, { color: theme.colors.onSurface }]}>
                      {formatCurrency(row.total)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {spenders.length > 0 ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  ХЭН ЗАРЦУУЛСАН · 7 ХОНОГ
                </Text>
                {spenders.map((person) => (
                  <View key={person.name} style={styles.legendRow}>
                    <View style={styles.flex}>
                      <Text style={[styles.legendLabel, { color: theme.colors.onSurface }]}>
                        👤 {person.name}
                      </Text>
                      <Text style={[styles.expenseMeta, { color: theme.custom.mutedText }]}>
                        {person.count} удаа
                      </Text>
                    </View>
                    <Text style={[styles.legendValue, { color: theme.colors.onSurface }]}>
                      {formatCurrency(person.total)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={cardStyle}>
              <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                ӨНӨӨДРИЙН БҮРТГЭЛ
              </Text>
              {todaysExpenses.length === 0 ? (
                <EmptyState icon="🧾" title="Өнөөдөр зарлага бүртгээгүй" />
              ) : (
                todaysExpenses.map((expense) => (
                  <View key={expense.id} style={styles.expenseRow}>
                    <View style={styles.flex}>
                      <Text style={[styles.expenseTitle, { color: theme.colors.onSurface }]}>
                        {categoryLabel(expense.category)}
                        {expense.note ? ` · ${expense.note}` : ''}
                      </Text>
                      <Text style={[styles.expenseMeta, { color: theme.custom.mutedText }]}>
                        👤 {expense.by || 'Тодорхойгүй'}
                        {timeOf(expense) ? ` · ${timeOf(expense)}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.expenseAmount, { color: theme.colors.onSurface }]}>
                      {formatCurrency(expense.amount)}
                    </Text>
                    <Pressable
                      onPress={() => confirm(expense.id, () => removeExpense(expense.id))}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Зарлага устгах"
                    >
                      <Text style={styles.deleteIcon}>
                        {armedId === expense.id ? '❌' : '🗑'}
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        ) : tab === 'profile' ? (
          <ProfileTab />
        ) : (
          <>
            {/* Clocking in, on the tab that is about the clock. Shared with the
                Цаг & Дадал screen rather than copied — this form decides what
                people are paid, and two copies would drift apart. */}
            {canRecord ? <ArrivalCard /> : null}

            {/* The manager's side of the same subject: which habits earn a
                score, and what a full month of them pays. */}
            {can('manageHabits') ? <HabitAdminCard /> : null}

            {/* The roster lives on the Админ screen — names, PINs and rest
                days, which is more than belongs on a card. It had no way in at
                all once the Нүүр tab left the bar, so this is it. */}
            {can('manageEmployees') ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  АЖИЛТАН УДИРДАХ
                </Text>
                <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                  {employees.length > 0
                    ? `${employees.length} ажилтан бүртгэлтэй. Нэр, PIN, амрах өдрийг тэндээс өөрчилнө.`
                    : 'Ажилтан бүртгээгүй байна. Нэр, PIN, амрах өдрийг оруулна уу.'}
                </Text>
                <Button
                  mode="contained-tonal"
                  icon="account-multiple-plus"
                  onPress={() => navigation.navigate('Admin')}
                >
                  Ажилтан нэмэх / хасах
                </Button>
              </View>
            ) : null}

            <View style={cardStyle}>
              <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                ӨНӨӨДРИЙН ИРЦ
              </Text>
              {todaysArrivals.length === 0 ? (
                <EmptyState icon="🕘" title="Өнөөдөр хэн ч ирээгүй байна" />
              ) : (
                todaysArrivals.map((log) => (
                  <View key={log.id} style={styles.scoreRow}>
                    <Text style={[styles.arrivalTime, { color: theme.colors.onSurface }]}>
                      {log.time}
                    </Text>
                    {faceOf(log.name) ? (
                      <Image
                        source={{ uri: faceOf(log.name) }}
                        style={styles.face}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                    <View style={styles.flex}>
                      <Text style={[styles.scoreName, { color: theme.colors.onSurface }]}>
                        {log.name}
                      </Text>
                      <Text style={[styles.expenseMeta, { color: theme.custom.mutedText }]}>
                        {/* The two stamps and the span between them — what
                            the manager opens this list to read. An open shift
                            says so rather than showing a blank. */}
                        {log.time}
                        {log.leaveTime ? ` – ${log.leaveTime}` : ' – …'}
                        {log.leaveTime
                          ? ` · ${workedLabel(
                              timeToMinutes(log.leaveTime) - timeToMinutes(log.time),
                            )}`
                          : ''}
                        {' · '}
                        {log.completedTaskCount ?? 0}/{log.totalTaskCount ?? 0} даалгавар
                        {canViewScores ? ` · ${log.completedScore ?? 0} оноо` : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.arrivalFlag,
                        { color: log.isLate ? theme.colors.error : theme.custom.selected },
                      ]}
                    >
                      {log.isLate ? 'Хоцорсон' : 'Цагтаа'}
                      {log.leftEarly ? '\nЭрт тарсан' : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {canViewScores && mine ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  МИНИЙ ОНОО · {currentMonthString()}
                </Text>
                <Text style={[styles.bigScore, { color: theme.colors.primary }]}>
                  {mine.score}
                  <Text style={[styles.bigScoreMax, { color: theme.custom.mutedText }]}>
                    {' '}
                    / {mine.maxScore}
                  </Text>
                </Text>
                <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                  {mine.days} өдөр ирсэн · {mine.onTime} цагтаа · {mine.late} хоцорсон
                </Text>
              </View>
            ) : null}

            {canViewScores ? (
              <View style={cardStyle}>
                <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>
                  ЭНЭ САРЫН ОНОО
                </Text>
                {performance.length === 0 ? (
                  <EmptyState icon="🏅" title="Энэ сард бүртгэл алга" />
                ) : (
                  performance.map((entry, index) => (
                    <View key={entry.name} style={styles.scoreRow}>
                      <Text style={[styles.rank, { color: theme.custom.mutedText }]}>
                        {index + 1}
                      </Text>
                      {faceOf(entry.name) ? (
                        <Image
                          source={{ uri: faceOf(entry.name) }}
                          style={styles.face}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : null}
                      <View style={styles.flex}>
                        <Text style={[styles.scoreName, { color: theme.colors.onSurface }]}>
                          {entry.name}
                        </Text>
                        <View
                          style={[
                            styles.progressTrack,
                            { backgroundColor: theme.colors.surfaceVariant },
                          ]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.round(entry.pct * 100)}%`,
                                backgroundColor: theme.custom.selected,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.scoreValue, { color: theme.colors.onSurface }]}>
                        {entry.score}
                      </Text>
                    </View>
                  ))
                )}
                <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                  Өдөрт хамгийн ихдээ {dailyMax} оноо. Оноо нь цаг бүртгэл, дадлын
                  даалгавраас цуглардаг — Цаг & Дадал хэсгээс тэмдэглэнэ.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingVertical: 10 },
  content: { paddingBottom: 40, gap: 12 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  spaced: { marginTop: 10 },

  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  stepLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  hint: { fontSize: 11, lineHeight: 16 },
  split: { flexDirection: 'row', gap: 8 },

  logout: { color: '#ffffff', fontSize: 13, fontWeight: '800' },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '700' },

  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartTotal: { fontSize: 15, fontWeight: '900' },
  /** Fixed height: the bars are read against each other, not against a scale. */
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 132, gap: 6 },
  barSlot: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, fontWeight: '800' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10 },

  legendRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  legendLabel: { fontSize: 13, fontWeight: '700' },
  legendValue: { fontSize: 13, fontWeight: '800' },

  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  expenseTitle: { fontSize: 13, fontWeight: '700' },
  expenseMeta: { fontSize: 10, marginTop: 2 },
  expenseAmount: { fontSize: 14, fontWeight: '900' },
  deleteIcon: { fontSize: 14, opacity: 0.5 },

  bigScore: { fontSize: 34, fontWeight: '900' },
  bigScoreMax: { fontSize: 16, fontWeight: '700' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rank: { fontSize: 12, fontWeight: '900', width: 16 },
  scoreName: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  scoreValue: { fontSize: 14, fontWeight: '900' },
  arrivalTime: { fontSize: 13, fontWeight: '900', width: 46 },
  /** Small on purpose — it is here to be recognised, not looked at. */
  face: { width: 28, height: 28, borderRadius: 14 },
  arrivalFlag: { fontSize: 11, fontWeight: '800' },
});
