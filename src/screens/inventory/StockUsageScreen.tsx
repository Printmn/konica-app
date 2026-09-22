import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useAuth } from '@/authentication/AuthContext';
import {
  OfflineBanner,
  PermissionDenied,
  SyncErrorBanner,
} from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import { onDay, totalSheets } from '@/features/inventory/stockUsage';
import { useResponsive } from '@/hooks/useResponsive';
import { useScreenBack } from '@/hooks/useScreenBack';
import { todayString } from '@/utils/date';

import { PaperUsagePanel } from './PaperUsagePanel';

/**
 * Зарцуулалт as a screen of its own.
 *
 * All of it now lives in `PaperUsagePanel`, because the Зарлага tab carries
 * the same thing and two copies of a form that decrements stock is how the two
 * quietly stop agreeing. This is the door from the sidebar; the panel is the
 * room.
 */
export function StockUsageScreen(): React.JSX.Element {
  const onBack = useScreenBack();
  const { can, workerName, role } = useAuth();
  const { gutter } = useResponsive();
  const { usage, isOffline, pendingWrites, syncError, syncNow } = useData();

  const today = todayString();

  if (!can('viewInventory')) {
    return (
      <Screen>
        <ScreenHeader title="Зарцуулалт" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Зарцуулалт"
        onBack={onBack}
        subtitle={`Өнөөдөр · ${totalSheets(onDay(usage, today))}ш`}
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? <SyncErrorBanner onRetry={() => void syncNow()} /> : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PaperUsagePanel
          date={today}
          canEdit={can('editCatalog')}
          by={workerName || role || ''}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
});
