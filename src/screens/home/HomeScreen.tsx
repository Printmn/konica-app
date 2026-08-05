import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { roleTitle } from '@/authentication/permissions';
import { OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useData } from '@/features/data/DataContext';
import { lowStockItems } from '@/features/inventory/inventoryLogic';
import { calculateDailyReport } from '@/features/reports/reportCalculator';
import { visibleWorkLogs } from '@/features/worklogs/workLogLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useResponsive } from '@/hooks/useResponsive';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';
import { longDateLabel, todayString } from '@/utils/date';
import { formatCurrency } from '@/utils/price';

/**
 * Dashboard.
 *
 * Keeps the shortcut-grid shape of the web home view but adds the three
 * numbers a manager actually opens the app for — today's revenue, open jobs,
 * and anything running out of stock.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Shortcut palette.
 *
 * The grid used to give every destination its own saturated hue, which made
 * the dashboard read as nine competing buttons. It now follows the web build:
 * one green banner for the primary action, calm blue chips for everything
 * else, and amber reserved for the one destructive-ish destination (Админ).
 */
const FEATURED_GRADIENT = ['#5cc47c', '#2f9e58'] as const;

type Tone = 'featured' | 'blue' | 'amber';

interface Shortcut {
  key: string;
  label: string;
  /** One-line description shown under the label, as in the web dashboard. */
  hint: string;
  icon: string;
  tone: Tone;
  go: (nav: Nav) => void;
  capability: Parameters<ReturnType<typeof useAuth>['can']>[0];
}

const SHORTCUTS: Shortcut[] = [
  {
    key: 'orders',
    label: 'Захиалга',
    hint: 'Ажлын бүртгэл & МКВ тооцоо',
    icon: 'clipboard-list',
    tone: 'featured',
    capability: 'viewOrders',
    go: (nav) => nav.navigate('Main', { screen: 'Orders' }),
  },
  {
    key: 'chat',
    label: 'Дотоод чат',
    hint: 'Мессеж',
    icon: 'message-text',
    tone: 'blue',
    capability: 'viewChat',
    go: (nav) => nav.navigate('Main', { screen: 'Chat' }),
  },
  {
    key: 'inventory',
    label: 'Барааны үнэ',
    hint: 'Материал',
    icon: 'package-variant',
    tone: 'blue',
    capability: 'viewInventory',
    go: (nav) => nav.navigate('Main', { screen: 'Inventory' }),
  },
  {
    key: 'services',
    label: 'Хэвлэлийн үнэ',
    hint: 'Үнийн жагсаалт',
    icon: 'format-list-bulleted',
    tone: 'blue',
    capability: 'viewServices',
    go: (nav) => nav.navigate('Main', { screen: 'Services' }),
  },
  {
    key: 'quotation',
    label: 'Үнийн санал',
    hint: 'Нэхэмжлэх баримт',
    icon: 'credit-card-outline',
    tone: 'blue',
    capability: 'viewQuotation',
    go: (nav) => nav.navigate('Quotation'),
  },
  {
    key: 'admin',
    label: 'Админ',
    hint: 'Ажилтан & дадал',
    icon: 'cog',
    tone: 'amber',
    capability: 'viewAdmin',
    go: (nav) => nav.navigate('Admin'),
  },
];

export function HomeScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const navigation = useNavigation<Nav>();
  const { role, workerName, can } = useAuth();
  const { workLogs, inventory, isOffline, pendingWrites, syncError, syncNow } = useData();
  const { columns, gutter } = useResponsive();

  const today = todayString();

  const report = useMemo(() => calculateDailyReport(workLogs, today), [workLogs, today]);
  const openJobs = useMemo(
    () => visibleWorkLogs(workLogs, null, today).filter((log) => log.status !== 'Болсон'),
    [workLogs, today],
  );
  const lowStock = useMemo(() => lowStockItems(inventory), [inventory]);

  const visibleShortcuts = useMemo(
    () => SHORTCUTS.filter((shortcut) => can(shortcut.capability)),
    [can],
  );

  const featured = visibleShortcuts.filter((shortcut) => shortcut.tone === 'featured');
  const rest = visibleShortcuts.filter((shortcut) => shortcut.tone !== 'featured');

  // Two columns like the web dashboard; three only on very wide tablets.
  const gridColumns = columns >= 4 ? 3 : 2;
  const tileWidth = `${100 / gridColumns - 2}%` as const;

  const chipBackground = (tone: Tone): string => {
    if (tone === 'amber') return theme.dark ? 'rgba(245,158,11,0.18)' : '#fef3c7';
    return theme.dark ? 'rgba(59,130,246,0.18)' : '#eff6ff';
  };
  const chipColor = (tone: Tone): string =>
    tone === 'amber' ? '#f59e0b' : theme.colors.primary;

  return (
    <Screen>
      <ScreenHeader
        title="Printmn Konica"
        onBack={onBack}
        subtitle={`${roleTitle(role, workerName)} · ${longDateLabel()}`}
        right={
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}
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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        showsVerticalScrollIndicator={false}
      >
        {can('viewReport') ? (
          <View style={styles.stats}>
            <StatTile
              label="Өнөөдрийн орлого"
              value={formatCurrency(report.totalRevenue)}
              icon="💰"
              emphasis
            />
            <StatTile
              label="Дуусаагүй ажил"
              value={String(openJobs.length)}
              icon="📋"
              tint="#f59e0b"
            />
          </View>
        ) : null}

        {lowStock.length > 0 && can('viewInventory') ? (
          <Pressable
            onPress={() => navigation.navigate('Main', { screen: 'Inventory' })}
            style={styles.warning}
            accessibilityRole="button"
          >
            <Text style={styles.warningTitle}>
              ⚠️ {lowStock.length} барааны үлдэгдэл дуусч байна
            </Text>
            <Text style={styles.warningBody} numberOfLines={1}>
              {lowStock
                .slice(0, 3)
                .map((item) => item.name)
                .join(' · ')}
            </Text>
          </Pressable>
        ) : null}

        {featured.map((shortcut) => (
          <Pressable
            key={shortcut.key}
            onPress={() => shortcut.go(navigation)}
            accessibilityRole="button"
            accessibilityLabel={shortcut.label}
            style={({ pressed }) => (pressed ? styles.tilePressed : null)}
          >
            <LinearGradient
              colors={FEATURED_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.featured}
            >
              <View style={styles.featuredIcon}>
                <Icon source={shortcut.icon} size={26} color="#ffffff" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.featuredLabel}>{shortcut.label}</Text>
                <Text style={styles.featuredHint}>{shortcut.hint}</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ))}

        <View style={styles.grid}>
          {rest.map((shortcut) => (
            <Pressable
              key={shortcut.key}
              onPress={() => shortcut.go(navigation)}
              accessibilityRole="button"
              accessibilityLabel={shortcut.label}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileWidth,
                  backgroundColor: theme.custom.cardBackground,
                  borderColor: theme.custom.subtleBorder,
                },
                pressed && styles.tilePressed,
              ]}
            >
              <View
                style={[styles.tileIcon, { backgroundColor: chipBackground(shortcut.tone) }]}
              >
                <Icon source={shortcut.icon} size={22} color={chipColor(shortcut.tone)} />
              </View>
              <Text
                style={[styles.tileLabel, { color: theme.colors.onSurface }]}
                numberOfLines={2}
              >
                {shortcut.label}
              </Text>
              <Text
                style={[styles.tileHint, { color: theme.custom.mutedText }]}
                numberOfLines={1}
              >
                {shortcut.hint}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 16, gap: 16 },
  stats: { flexDirection: 'row', gap: 10 },
  warning: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 2,
  },
  warningTitle: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  warningBody: { fontSize: 11, color: '#a16207' },
  flex: { flex: 1 },

  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  featuredIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredLabel: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  featuredHint: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
    minHeight: 116,
  },
  tilePressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tileLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  tileHint: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
