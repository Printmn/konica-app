import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { useData } from '@/features/data/DataContext';
import { workedLabel } from '@/features/attendance/clockInReminders';
import {
  attendanceBars,
  chartTotals,
  personBars,
} from '@/features/performance/attendanceChart';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { EmployeePerformance } from '@/types';

/**
 * Ирц & дадал as a picture.
 *
 * The manager already has these numbers in a table. What a table cannot show
 * is shape — that somebody is ten minutes late every Monday, or that the whole
 * shop's habit score fell off the week the printer broke. Both are obvious in
 * a bar and invisible in a column of figures.
 */
interface AttendanceChartCardProps {
  /** The month's per-person rows, already computed by the screen. */
  performance: readonly EmployeePerformance[];
  /** Days in the window. Two weeks fits a phone without the bars turning to threads. */
  days?: number;
}

const ON_TIME = '#16a34a';
const LATE = '#dc2626';

export function AttendanceChartCard({
  performance,
  days = 14,
}: AttendanceChartCardProps): React.JSX.Element {
  const theme = useAppTheme();
  const { attendanceLogs } = useData();

  const bars = useMemo(() => attendanceBars(attendanceLogs, { days }), [attendanceLogs, days]);
  const totals = useMemo(() => chartTotals(bars), [bars]);
  const people = useMemo(
    () => personBars(performance, attendanceLogs),
    [performance, attendanceLogs],
  );

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            📊 ИРЦ & ДАДАЛ · {days} ХОНОГ
          </Text>
          <Text style={[styles.headline, { color: theme.colors.primary }]}>
            {totals.punctuality === null
              ? '—'
              : `${Math.round(totals.punctuality * 100)}% цагтаа`}
          </Text>
        </View>

        {/* Each bar is the day's habit score against *that day's* ceiling, not
            against the busiest day in the window. Two people on Monday and
            four on Tuesday means a higher ceiling on Tuesday, and scaling to
            the tallest bar would make a perfect Monday look like a bad one. */}
        <View style={styles.chart}>
          {bars.map((bar) => (
            <View key={bar.date} style={styles.slot}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(bar.height * 100, bar.maxScore > 0 ? 4 : 0)}%`,
                      backgroundColor: bar.late > 0 ? LATE : ON_TIME,
                      opacity: bar.isToday ? 1 : 0.75,
                    },
                  ]}
                />
              </View>
              {/* Lateness rides as a dot rather than a second bar: on a
                  fourteen-column chart a stacked segment for one person is
                  two pixels tall and reads as noise. */}
              {bar.late > 0 ? <View style={[styles.lateDot, { backgroundColor: LATE }]} /> : null}
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: bar.isToday ? theme.colors.primary : theme.custom.mutedText,
                    fontWeight: bar.isToday ? '900' : '600',
                  },
                ]}
              >
                {bar.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: theme.custom.mutedText }]}>
            🟢 {totals.onTime} цагтаа · 🔴 {totals.late} хоцорсон · ⭐ {totals.score}/
            {totals.maxScore} оноо · ⏱ {workedLabel(totals.workedMinutes)}
            {totals.openShifts > 0 ? ` · ${totals.openShifts} тараагүй` : ''}
          </Text>
        </View>
      </Card>

      {people.length > 0 ? (
        <Card style={styles.card}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            👥 ХҮН ТУС БҮР
          </Text>

          {/* Weakest first. Sorting by the best puts the person who needs a
              word at the bottom of the screen, which is the one place a
              manager scrolling between customers will not look. */}
          {people.map((person) => (
            <View key={person.name} style={styles.person}>
              <View style={styles.personHead}>
                <Text style={[styles.personName, { color: theme.colors.onSurface }]}>
                  {person.name}
                </Text>
                <Text style={[styles.personScore, { color: theme.colors.onSurface }]}>
                  {person.score}/{person.maxScore}
                </Text>
              </View>
              <View style={[styles.rail, { backgroundColor: theme.colors.surfaceVariant }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(person.ratio * 100, person.score > 0 ? 3 : 0)}%`,
                      backgroundColor:
                        person.punctuality !== null && person.punctuality < 0.8 ? LATE : ON_TIME,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.personMeta, { color: theme.custom.mutedText }]}>
                {person.onTime} цагтаа · {person.late} хоцорсон
                {person.punctuality === null
                  ? ''
                  : ` · ${Math.round(person.punctuality * 100)}%`}
                {person.workedMinutes > 0 ? ` · ⏱ ${workedLabel(person.workedMinutes)}` : ''}
                {person.openShifts > 0 ? ` · ${person.openShifts} тараагүй` : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },
  headline: { fontSize: 15, fontWeight: '900' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 116, gap: 3 },
  slot: { flex: 1, alignItems: 'center', gap: 3 },
  track: { flex: 1, width: '72%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  lateDot: { width: 5, height: 5, borderRadius: 3 },
  dayLabel: { fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  legendText: { fontSize: 10, fontWeight: '700' },
  person: { gap: 4 },
  personHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  personName: { fontSize: 13, fontWeight: '800' },
  personScore: { fontSize: 12, fontWeight: '900' },
  rail: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  personMeta: { fontSize: 10, fontWeight: '600' },
});
