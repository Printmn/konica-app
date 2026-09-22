import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useAuth } from '@/authentication/AuthContext';
import { OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useScreenBack } from '@/hooks/useScreenBack';

import { ProfileTab } from './components/ProfileTab';

/**
 * Мэдээлэл — the staff profile, on a tab of its own.
 *
 * It was a third sub-tab inside Ажилтан, two taps down from the bar. A phone
 * number and an emergency contact are the things somebody reaches for in a
 * hurry, so they get a button on the bar instead. The manager still edits
 * anybody's from inside Ажилтан; this screen is the person's own.
 */
export function ProfileScreen(): React.JSX.Element {
  const onBack = useScreenBack();
  const { workerName, displayName } = useAuth();
  const { gutter } = useResponsive();
  const { isOffline, pendingWrites, syncError, syncNow } = useData();

  return (
    <Screen>
      <ScreenHeader
        title="Хувийн мэдээлэл"
        onBack={onBack}
        subtitle={workerName || displayName}
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? <SyncErrorBanner onRetry={() => void syncNow()} /> : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProfileTab />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
});
