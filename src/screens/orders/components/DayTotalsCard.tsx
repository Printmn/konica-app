import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PAYMENT_COLORS } from '@/theme/colors';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { DailyReport } from '@/types';
import { formatCurrency } from '@/utils/price';

/**
 * One day's takings, split the way the shop settles up.
 *
 * Shown above the board in the archive, because that is the question somebody
 * opens a past day to ask: what came in, and how much of it was cash. The
 * figures come straight from `calculateDailyReport`, the same function the
 * report screen and the Excel export use — a second calculation here is how
 * two screens end up disagreeing about a Tuesday.
 *
 * Only lines with money in them are drawn. A day with no card payments has no
 * card row rather than a row of zeros, so the eye lands on what happened.
 *
 * The headline figure is money actually taken. Work booked «Тооцоотой» gets its
 * own line below the rule, in red, because it is owed rather than earned — and
 * because with it folded into the total the three method lines did not add up
 * to the number above them.
 */
interface DayTotalsCardProps {
  report: DailyReport;
  /** `2026-08-04` — the day these figures belong to. */
  date: string;
}

export function DayTotalsCard({ report, date }: DayTotalsCardProps): React.JSX.Element {
  const theme = useAppTheme();

  const rows: { label: string; value: number; tint: string }[] = [
    { label: '🏦 Данс', value: report.totalTransfer, tint: PAYMENT_COLORS.Данс },
    { label: '💵 Бэлэн', value: report.totalCash, tint: PAYMENT_COLORS.Бэлэн },
    { label: '💳 Карт', value: report.totalCard, tint: PAYMENT_COLORS.Карт },
  ].filter((row) => row.value > 0);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.subtleBorder,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.label, { color: theme.custom.mutedText }]}>
          {date} · {report.logs.length} ажил
        </Text>
        <Text style={[styles.total, { color: theme.colors.primary }]}>
          {formatCurrency(report.totalRevenue)}
        </Text>
      </View>

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: theme.custom.mutedText }]}>
          Төлбөрийн хэлбэр бүртгэгдээгүй
        </Text>
      ) : (
        rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: row.tint }]} />
            <Text style={[styles.rowLabel, { color: theme.colors.onSurface }]}>{row.label}</Text>
            <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>
              {formatCurrency(row.value)}
            </Text>
          </View>
        ))
      )}

      {report.totalUnsettled > 0 ? (
        <View style={[styles.vatRow, { borderTopColor: theme.custom.subtleBorder }]}>
          <Text style={[styles.rowLabel, { color: theme.colors.error }]}>
            🧾 Тооцоотой ({report.unsettledCount})
          </Text>
          <Text style={[styles.rowValue, { color: theme.colors.error }]}>
            {formatCurrency(report.totalUnsettled)}
          </Text>
        </View>
      ) : null}

      {report.totalVat > 0 ? (
        <View style={[styles.vatRow, { borderTopColor: theme.custom.subtleBorder }]}>
          <Text style={[styles.rowLabel, { color: theme.custom.mutedText }]}>
            Үүнээс НӨАТ (10%)
          </Text>
          <Text style={[styles.rowValue, { color: theme.custom.mutedText }]}>
            {formatCurrency(report.totalVat)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  total: { fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** The same colour the payment chips use, so the two read as one language. */
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  rowValue: { fontSize: 13, fontWeight: '900' },
  vatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
  },
  empty: { fontSize: 11 },
});
