import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import {
  createAnnouncement,
  isReadBy,
  markAllRead,
  newestFirst,
  readersLabel,
  unreadCount,
  validateAnnouncement,
} from '@/features/announcements/announcementLogic';
import { useData } from '@/features/data/DataContext';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useToast } from '@/hooks/useToast';
import { notifyAnnouncement } from '@/services/notifications/notificationService';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Мэдээлэл — the shop's notice board.
 *
 * The manager posts the day's plan here and everyone else reads it. This used
 * to go in the chat, where a plan is three messages up by the afternoon and
 * nobody can say who saw it.
 *
 * Opening the screen marks everything read, which is the honest reading of
 * "has Bat seen it" — he is looking at it. Marking per notice on tap would be
 * more precise and would also leave anything he scrolled past unread for ever.
 */
export function NoticesScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { show } = useToast();
  const { can, role, workerName, displayName } = useAuth();
  const { gutter } = useResponsive();
  const { armedId, confirm } = useConfirmAction();
  const { announcements, setAnnouncements, isOffline, pendingWrites, syncError, syncNow } =
    useData();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const me = workerName || role || '';
  const canPost = can('manageHabits');

  const rows = useMemo(() => newestFirst(announcements), [announcements]);
  const unread = useMemo(() => unreadCount(rows, me), [rows, me]);

  /**
   * Reading them, by being here.
   *
   * Deliberately not a `useFocusEffect`: this writes to a synced collection,
   * and re-marking on every focus would queue a write each time the tab is
   * touched. Guarded on the count so it fires once, when there is something
   * to clear.
   */
  useEffect(() => {
    if (unread === 0 || me === '') return;
    setAnnouncements((previous) => markAllRead(previous, me));
  }, [unread, me, setAnnouncements]);

  const post = useCallback(() => {
    const draft = { title, body, by: workerName || displayName || 'Менежер' };
    const problem = validateAnnouncement(draft);
    if (problem !== null) {
      show(problem, 'error');
      return;
    }
    const notice = createAnnouncement(draft);
    setAnnouncements((previous) => [notice, ...previous]);
    setTitle('');
    setBody('');
    // Fire-and-forget: a failed alert must not lose the notice itself.
    void notifyAnnouncement(notice.title, notice.body);
    show('Мэдээлэл нийтлэгдлээ', 'success');
  }, [title, body, workerName, displayName, setAnnouncements, show]);

  const remove = useCallback(
    (id: number) => {
      confirm(id, (confirmed) => {
        setAnnouncements((previous) => previous.filter((row) => row.id !== confirmed));
        show('Устгалаа', 'success');
      });
    },
    [confirm, setAnnouncements, show],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Мэдээлэл"
        onBack={onBack}
        subtitle={rows.length === 0 ? 'Мэдээлэл алга' : `${rows.length} мэдээлэл`}
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? <SyncErrorBanner onRetry={() => void syncNow()} /> : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {canPost ? (
          <Card style={styles.card}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              📢 Мэдээлэл нийтлэх
            </Text>
            <TextInput
              mode="outlined"
              label="Гарчиг"
              value={title}
              onChangeText={setTitle}
              placeholder="Өнөөдрийн төлөвлөгөө"
              dense
            />
            <TextInput
              mode="outlined"
              label="Тайлбар"
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={4}
            />
            <Button mode="contained" icon="bullhorn" onPress={post}>
              Нийтлэх
            </Button>
          </Card>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Мэдээлэл алга"
            hint={canPost ? 'Дээрээс нийтэлнэ үү' : 'Менежерээс мэдээлэл ирвэл энд харагдана'}
          />
        ) : (
          rows.map((notice) => {
            // Unread is judged against the data this render received, not
            // after the effect above clears it — otherwise every notice would
            // look read the instant the screen drew.
            const fresh = !isReadBy(notice, me);
            return (
              <Card
                key={notice.id}
                style={styles.card}
                {...(fresh ? { accentColor: theme.colors.primary } : {})}
              >
                <View style={styles.head}>
                  <Text style={[styles.noticeTitle, { color: theme.colors.onSurface }]}>
                    {fresh ? '🔵 ' : ''}
                    {notice.title}
                  </Text>
                  {canPost ? (
                    <Text
                      style={armedId === notice.id ? styles.deleteArmed : styles.deleteIcon}
                      onPress={() => remove(notice.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${notice.title} устгах`}
                    >
                      {armedId === notice.id ? 'Устгах?' : '🗑'}
                    </Text>
                  ) : null}
                </View>

                {notice.body ? (
                  <Text style={[styles.body, { color: theme.colors.onSurface }]}>
                    {notice.body}
                  </Text>
                ) : null}

                <Text style={[styles.meta, { color: theme.custom.mutedText }]}>
                  {notice.date} · {notice.by || '—'}
                  {/* Who has read it is the manager's question. Printing it for
                      everyone would make a small shop's reading habits
                      public. */}
                  {canPost ? ` · ${readersLabel(notice)}` : ''}
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 10 },
  card: { gap: 8 },
  title: { fontSize: 13, fontWeight: '900' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noticeTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 10, fontWeight: '600' },
  deleteIcon: { fontSize: 14, opacity: 0.5 },
  deleteArmed: { fontSize: 11, fontWeight: '900', color: '#dc2626' },
});
