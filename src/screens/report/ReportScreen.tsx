import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, Icon } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { OfflineBanner, SyncErrorBanner, PermissionDenied } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { useData } from '@/features/data/DataContext';
import { calculateDailyReport } from '@/features/reports/reportCalculator';
import { performanceLabel, workLogRowColor } from '@/features/worklogs/workLogLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { exportDailyWorkLogs } from '@/services/export/excelService';
import { useAppTheme } from '@/theme/ThemeProvider';
import { todayString } from '@/utils/date';
import { effectivePrice, formatCurrency } from '@/utils/price';

/**
 * Daily revenue report.
 *
 * Totals come from `reportCalculator`, which counts only work logs and applies
 * VAT — see the note there about why quick orders are deliberately excluded.
 *
 * The layout mirrors the web build's report page: one export action, a green
 * revenue hero, the payment-method breakdown as tiles, then the day's log.
 */

/** Hero/action green — kept local because it is unique to this screen. */
const GREEN_GRADIENT = ['#4aa87c', '#33996a'] as const;
const GREEN_SOLID = '#2f8f63';

interface SummaryTileProps {
  label: string;
  value: string;
  icon: string;
  tint: string;
  basis: `${number}%`;
}

function SummaryTile({
  label,
  value,
  icon,
  tint,
  basis,
}: SummaryTileProps): React.JSX.Element {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.tile,
        {
          flexBasis: basis,
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.subtleBorder,
        },
      ]}
    >
      <Icon source={icon} size={20} color={tint} />
      <Text style={[styles.tileLabel, { color: theme.colors.onSurface }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.tileValue, { color: theme.colors.onSurface }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

export function ReportScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { can } = useAuth();
  const { show, showError } = useToast();
  const { gutter, isTablet } = useResponsive();
  const { workLogs, setWorkLogs, isOffline, pendingWrites, syncError, syncNow } =
    useData();

  const [busy, setBusy] = useState(false);
  const { armedId, confirm } = useConfirmAction();

  const today = todayString();
  const report = useMemo(() => calculateDailyReport(workLogs, today), [workLogs, today]);

  const deleteLog = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setWorkLogs((previous) => previous.filter((log) => log.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setWorkLogs, show],
  );

  const exportExcel = useCallback(async () => {
    setBusy(true);
    const result = await exportDailyWorkLogs(report.logs, today);
    setBusy(false);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    // Saving straight into a folder happens silently, so without this the
    // button looks like it did nothing at all.
    show('Excel хадгалагдлаа', 'success');
  }, [report.logs, today, show, showError]);

  if (!can('viewReport')) {
    return (
      <Screen>
        <ScreenHeader title="Өдрийн тайлан" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  const canExport = can('exportData');
  // Same rule as the work board: correcting a job is counter work, removing
  // one from the day's takings is not.
  const canDelete = can('deleteWorkLogs');
  const exportDisabled = busy || report.logs.length === 0;
  const tileBasis: `${number}%` = isTablet ? '22%' : '46%';

  return (
    <Screen>
      <ScreenHeader title="Өдрийн тайлан" subtitle={today} onBack={onBack} />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <FlatList
        data={report.logs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            {canExport ? (
              <Pressable
                onPress={() => void exportExcel()}
                disabled={exportDisabled}
                accessibilityRole="button"
                accessibilityLabel="Тайлан харах, Excel хэвлэх"
                accessibilityState={{ disabled: exportDisabled }}
                style={({ pressed }) => [
                  styles.exportButton,
                  { backgroundColor: GREEN_SOLID },
                  exportDisabled ? styles.disabled : null,
                  pressed && !exportDisabled ? styles.pressed : null,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size={18} color="#ffffff" />
                ) : (
                  <Icon source="tray-arrow-down" size={20} color="#ffffff" />
                )}
                <Text style={styles.exportLabel}>Тайлан харах / Excel хэвлэх</Text>
              </Pressable>
            ) : null}

            <LinearGradient
              colors={GREEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroLabel}>ОРОЙН НЭГТГЭЛ / НИЙТ ОРЛОГО</Text>
              <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(report.totalRevenue)}
              </Text>
              <Text style={styles.heroHint}>
                Өнөөдөр хийгдсэн нийт {report.logs.length} гүйлгээ
              </Text>
            </LinearGradient>

            <View style={styles.tileGrid}>
              <SummaryTile
                label="ДАНС"
                value={formatCurrency(report.totalTransfer)}
                icon="cellphone"
                tint="#1a56db"
                basis={tileBasis}
              />
              <SummaryTile
                label="БЭЛЭН"
                value={formatCurrency(report.totalCash)}
                icon="cash"
                tint="#16a34a"
                basis={tileBasis}
              />
              <SummaryTile
                label="КАРТ"
                value={formatCurrency(report.totalCard)}
                icon="credit-card-outline"
                tint="#a855f7"
                basis={tileBasis}
              />
              <SummaryTile
                label="НӨАТ"
                value={formatCurrency(report.totalVat)}
                icon="receipt"
                tint="#f59e0b"
                basis={tileBasis}
              />
            </View>

            <Card padded={false} style={styles.logHeaderCard}>
              <View
                style={[
                  styles.logHeaderRow,
                  { borderBottomColor: theme.custom.subtleBorder },
                ]}
              >
                <View style={styles.logHeaderLeft}>
                  <Icon source="clipboard-text-outline" size={16} color={GREEN_SOLID} />
                  <Text style={[styles.logHeaderTitle, { color: theme.colors.onSurface }]}>
                    ӨДРИЙН БҮРТГЭЛ — {report.logs.length} АЖИЛ
                  </Text>
                </View>
                <Text style={[styles.logHeaderDate, { color: theme.colors.onSurface }]}>
                  {today}
                </Text>
              </View>

              {report.logs.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.onSurface }]}>
                  Өнөөдөр ажил бүртгэгдээгүй байна.
                </Text>
              ) : null}
            </Card>
          </View>
        }
        renderItem={({ item, index }) => (
          <Card accentColor={workLogRowColor(item)}>
            <View style={styles.row}>
              <Text style={[styles.index, { color: theme.custom.mutedText }]}>{index + 1}</Text>
              <View style={styles.flex}>
                <Text
                  style={[styles.job, { color: theme.colors.onSurface }]}
                  numberOfLines={2}
                >
                  {item.job}
                </Text>
                <Text style={[styles.meta, { color: theme.custom.mutedText }]}>
                  {item.receivedTime ? `${item.receivedTime} · ` : ''}
                  {item.payType || '—'} · {performanceLabel(item)}
                </Text>
              </View>
              <View style={styles.trailing}>
                <Text style={[styles.amount, { color: theme.colors.primary }]}>
                  {formatCurrency(effectivePrice(item))}
                </Text>
                {item.hasVat ? <Text style={styles.vat}>НӨАТ</Text> : null}
              </View>
              {canDelete ? (
                <Text
                  style={armedId === item.id ? styles.deleteArmed : styles.deleteIcon}
                  onPress={() => deleteLog(item.id)}
                >
                  {armedId === item.id ? 'Устгах?' : '🗑'}
                </Text>
              ) : null}
            </View>
          </Card>
        )}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 12, paddingBottom: 40 },
  header: { gap: 12, paddingBottom: 12 },

  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  exportLabel: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  hero: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  heroValue: { color: '#ffffff', fontSize: 34, fontWeight: '900' },
  heroHint: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tileLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  tileValue: { fontSize: 16, fontWeight: '900' },

  logHeaderCard: { marginTop: 4 },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  logHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  logHeaderTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3, flexShrink: 1 },
  logHeaderDate: { fontSize: 12, fontWeight: '800' },
  emptyText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },

  separator: { height: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: { fontSize: 11, fontWeight: '900', width: 18 },
  flex: { flex: 1 },
  job: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  meta: { fontSize: 10, marginTop: 2 },
  trailing: { alignItems: 'flex-end' },
  amount: { fontSize: 13, fontWeight: '900' },
  vat: { fontSize: 9, fontWeight: '700', color: '#6d28d9' },
  deleteIcon: { fontSize: 13, opacity: 0.35, paddingLeft: 4 },
  deleteArmed: { fontSize: 10, fontWeight: '900', color: '#dc2626', paddingLeft: 4 },
});
