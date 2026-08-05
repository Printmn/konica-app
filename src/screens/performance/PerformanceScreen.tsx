import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton, ProgressBar, SegmentedButtons } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import {
  EmptyState,
  OfflineBanner,
  PermissionDenied,
} from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { MAX_MONTHLY_BONUS } from '@/constants/config';
import { useData } from '@/features/data/DataContext';
import {
  calculateMonthlyRevenue,
  calculatePerformance,
  dailyMaxScore,
} from '@/features/performance/bonusCalculator';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { exportMonthlyWorkbook } from '@/services/export/excelService';
import { useAppTheme } from '@/theme/ThemeProvider';
import { currentMonthString, monthLabel, shiftMonth } from '@/utils/date';
import { formatCurrency, formatNumber } from '@/utils/price';

/**
 * Monthly leaderboard and bonus.
 *
 * Every figure here comes from `bonusCalculator` — the screen does no maths of
 * its own. Bonus is `round(min(score/maxScore, 1) × 100,000)`, so a perfect
 * month caps at ₮100,000 and partial months scale linearly.
 */

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function PerformanceScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { can } = useAuth();
  const { showError } = useToast();
  const { gutter } = useResponsive();
  const { attendanceLogs, employees, tasks, workLogs, isOffline, pendingWrites } = useData();

  const [month, setMonth] = useState(currentMonthString());
  const [tab, setTab] = useState<'summary' | 'revenue'>('summary');
  const [busy, setBusy] = useState(false);

  const performance = useMemo(
    () => calculatePerformance({ month, attendanceLogs, employees, tasks }),
    [month, attendanceLogs, employees, tasks],
  );

  const revenue = useMemo(
    () => calculateMonthlyRevenue(month, workLogs),
    [month, workLogs],
  );

  const dailyMax = useMemo(() => dailyMaxScore(tasks), [tasks]);
  const totalBonus = useMemo(
    () => performance.reduce((sum, employee) => sum + employee.bonus, 0),
    [performance],
  );

  const exportMonth = useCallback(async () => {
    setBusy(true);
    const result = await exportMonthlyWorkbook({ month, workLogs, performance, tasks });
    setBusy(false);
    if (!result.ok) showError(result.error);
  }, [month, workLogs, performance, tasks, showError]);

  if (!can('viewPerformance')) {
    return (
      <Screen>
        <ScreenHeader title="Сарын үзүүлэлт" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Сарын үзүүлэлт" subtitle={monthLabel(month)} onBack={onBack} />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.monthBar} padded={false}>
          <IconButton
            icon="chevron-left"
            onPress={() => setMonth((value) => shiftMonth(value, -1))}
            accessibilityLabel="Өмнөх сар"
          />
          <Text style={[styles.monthLabel, { color: theme.colors.onSurface }]}>
            {monthLabel(month)}
          </Text>
          <View style={styles.monthActions}>
            {can('exportData') ? (
              <Button
                mode="text"
                compact
                icon="microsoft-excel"
                onPress={() => void exportMonth()}
                disabled={busy}
              >
                Excel
              </Button>
            ) : null}
            <IconButton
              icon="chevron-right"
              onPress={() => setMonth((value) => shiftMonth(value, 1))}
              disabled={month >= currentMonthString()}
              accessibilityLabel="Дараах сар"
            />
          </View>
        </Card>

        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value)}
          density="small"
          buttons={[
            { value: 'summary', label: 'Дадал & Урамшуулал', icon: 'trophy' },
            { value: 'revenue', label: 'Орлого', icon: 'cash' },
          ]}
        />

        {tab === 'summary' ? (
          <>
            <View style={styles.statRow}>
              <StatTile
                label="Нийт урамшуулал"
                value={formatCurrency(totalBonus)}
                icon="🎁"
                emphasis
              />
              <StatTile
                label="Өдрийн макс оноо"
                value={String(dailyMax)}
                icon="⭐"
                tint="#f59e0b"
              />
            </View>

            {performance.length === 0 ? (
              <EmptyState
                icon="📈"
                title="Энэ сард бүртгэл алга"
                hint="Цаг бүртгэл хийсний дараа эндээс үзүүлэлт харагдана."
              />
            ) : (
              performance.map((employee, index) => (
                <Card key={employee.name} style={styles.employeeCard}>
                  <View style={styles.employeeHead}>
                    <Text style={styles.medal}>{MEDALS[index] ?? `${index + 1}.`}</Text>
                    <Text
                      style={[styles.employeeName, { color: theme.colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {employee.name}
                    </Text>
                    <Text style={[styles.bonus, { color: theme.colors.primary }]}>
                      {formatCurrency(employee.bonus)}
                    </Text>
                  </View>

                  <ProgressBar
                    progress={employee.pct}
                    color={
                      employee.pct >= 0.8
                        ? '#16a34a'
                        : employee.pct >= 0.5
                          ? '#f59e0b'
                          : '#dc2626'
                    }
                    style={styles.progress}
                  />

                  <View style={styles.employeeStats}>
                    <Text style={[styles.stat, { color: theme.custom.mutedText }]}>
                      ✓ Цагтаа {employee.onTime}
                    </Text>
                    <Text style={[styles.stat, { color: theme.custom.mutedText }]}>
                      ⏰ Хоцролт {employee.late}
                    </Text>
                    <Text style={[styles.stat, { color: theme.custom.mutedText }]}>
                      📅 {employee.workDays} өдөр
                    </Text>
                    <Text style={[styles.stat, { color: theme.custom.mutedText }]}>
                      ⭐ {employee.score}/{employee.maxScore}
                    </Text>
                    <Text style={[styles.statStrong, { color: theme.colors.primary }]}>
                      {Math.round(employee.pct * 100)}%
                    </Text>
                  </View>
                </Card>
              ))
            )}

            <Text style={[styles.footnote, { color: theme.custom.mutedText }]}>
              Урамшууллын дээд хэмжээ: {formatCurrency(MAX_MONTHLY_BONUS)} · Хувь ={' '}
              олсон оноо ÷ (ажлын өдөр × өдрийн макс оноо)
            </Text>
          </>
        ) : (
          <>
            <StatTile
              label="Сарын нийт орлого"
              value={formatCurrency(revenue.totalRevenue)}
              icon="💰"
              emphasis
            />
            <StatTile
              label="Захиалгын тоо"
              value={formatNumber(revenue.orderCount)}
              icon="📋"
            />

            {Object.entries(revenue.revenueByType).length === 0 ? (
              <EmptyState icon="💸" title="Энэ сард орлого бүртгэгдээгүй" />
            ) : (
              <Card style={styles.revenueCard}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Төлбөрийн хэлбэрээр
                </Text>
                {Object.entries(revenue.revenueByType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, amount]) => (
                    <View key={type} style={styles.revenueRow}>
                      <Text style={[styles.revenueType, { color: theme.colors.onSurface }]}>
                        {type}
                      </Text>
                      <Text style={[styles.revenueAmount, { color: theme.colors.primary }]}>
                        {formatCurrency(amount)}
                      </Text>
                    </View>
                  ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 12, gap: 10, paddingBottom: 40 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  monthLabel: { fontSize: 14, fontWeight: '800' },
  monthActions: { flexDirection: 'row', alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: 8 },
  employeeCard: { gap: 8 },
  employeeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medal: { fontSize: 20 },
  employeeName: { flex: 1, fontSize: 14, fontWeight: '800' },
  bonus: { fontSize: 15, fontWeight: '900' },
  progress: { height: 8, borderRadius: 4 },
  employeeStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  stat: { fontSize: 11, fontWeight: '600' },
  statStrong: { fontSize: 12, fontWeight: '900', marginLeft: 'auto' },
  footnote: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  revenueCard: { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  revenueRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  revenueType: { fontSize: 12, fontWeight: '700' },
  revenueAmount: { fontSize: 13, fontWeight: '900' },
});
