import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';
import type { AppError } from '@/types';
import { errorMessage } from '@/utils/result';

/**
 * Loading / empty / error / offline placeholders.
 *
 * Having these as one small family means every list in the app handles the four
 * non-happy states the same way, which the web build did not do consistently.
 */

// ── Loading ──────────────────────────────────────────────────────────

export const LoadingState = memo(function LoadingState({
  label = 'Уншиж байна...',
}: {
  label?: string;
}): React.JSX.Element {
  const theme = useAppTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.caption, { color: theme.custom.mutedText }]}>{label}</Text>
    </View>
  );
});

// ── Empty ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

export const EmptyState = memo(function EmptyState({
  icon = '📭',
  title,
  hint,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const theme = useAppTheme();
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>{icon}</Text>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      {hint ? (
        <Text style={[styles.caption, { color: theme.custom.mutedText }]}>{hint}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button mode="contained-tonal" onPress={onAction} style={styles.action}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
});

// ── Error ────────────────────────────────────────────────────────────

export const ErrorState = memo(function ErrorState({
  error,
  onRetry,
}: {
  error: AppError;
  onRetry?: () => void;
}): React.JSX.Element {
  const theme = useAppTheme();
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>{error.kind === 'permission' ? '🔒' : '⚠️'}</Text>
      <Text style={[styles.title, { color: theme.colors.error }]}>Алдаа гарлаа</Text>
      <Text style={[styles.caption, { color: theme.custom.mutedText }]}>
        {errorMessage(error)}
      </Text>
      {onRetry ? (
        <Button mode="contained" onPress={onRetry} style={styles.action}>
          Дахин оролдох
        </Button>
      ) : null}
    </View>
  );
});

// ── Offline banner ───────────────────────────────────────────────────

export const OfflineBanner = memo(function OfflineBanner({
  pendingWrites,
}: {
  pendingWrites: number;
}): React.JSX.Element {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        📴 Офлайн горим
        {pendingWrites > 0 ? ` · ${pendingWrites} өөрчлөлт хүлээгдэж байна` : ''}
      </Text>
    </View>
  );
});

/**
 * Shown when the last sync failed while the device is online.
 *
 * `DataContext` has always tracked `syncError`, but nothing rendered it — so a
 * rejected write or a broken database rule looked exactly like everything
 * working, right up until someone noticed a day's orders had never left the
 * phone. Nothing is lost when this appears; the writes stay queued.
 */
export const SyncErrorBanner = memo(function SyncErrorBanner({
  onRetry,
}: {
  onRetry?: (() => void) | undefined;
}): React.JSX.Element {
  return (
    <Pressable onPress={onRetry} disabled={!onRetry} accessibilityRole="button">
      <View style={styles.errorBanner}>
        <Text style={styles.errorBannerText}>
          ⚠️ Серверт холбогдож чадсангүй. Өөрчлөлт хадгалагдаж, дараа илгээгдэнэ.
          {onRetry ? ' Дахин оролдохын тулд дарна уу.' : ''}
        </Text>
      </View>
    </Pressable>
  );
});

/** Shown when a role lacks the capability a screen requires. */
export const PermissionDenied = memo(function PermissionDenied(): React.JSX.Element {
  return (
    <EmptyState
      icon="🔒"
      title="Хандах эрх байхгүй"
      hint="Энэ хэсгийг зөвхөн менежер үзэх боломжтой."
    />
  );
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 6,
  },
  emoji: { fontSize: 36, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  caption: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  action: { marginTop: 12 },
  banner: {
    backgroundColor: '#f59e0b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  bannerText: { color: '#111827', fontSize: 11, fontWeight: '800' },
  errorBanner: {
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorBannerText: { color: '#92400e', fontSize: 11, fontWeight: '700', lineHeight: 16 },
});
