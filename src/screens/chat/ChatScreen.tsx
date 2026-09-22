import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, LoadingState } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useChat } from '@/features/chat/ChatContext';
import { isOwnMessage } from '@/features/chat/chatRepository';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useData } from '@/features/data/DataContext';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import type { RootStackParamList } from '@/navigation/types';
import { captureImage, pickImageFromLibrary } from '@/services/media/imageService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ChatMessage } from '@/types';
import { toDateString, todayString } from '@/utils/date';

/**
 * Internal group chat.
 *
 * One shared room for the whole shop — see `ChatContext` for the sync and
 * offline model. There is no profile system on purpose: the shop signs in with
 * three shared PINs, so a message is labelled with the role or worker name that
 * sent it and grouped by device.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** `2026-08-04` → `Өнөөдөр` / `Өчигдөр` / `2026-08-02`. */
function dayLabel(at: number): string {
  const date = toDateString(new Date(at));
  if (date === todayString()) return 'Өнөөдөр';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === toDateString(yesterday)) return 'Өчигдөр';
  return date;
}

/**
 * A sender's face, or their initial.
 *
 * Matched by name because that is what a message carries — the device id says
 * which handset sent it, and the counter iPad is everybody's. The fallback is
 * a letter rather than a grey circle: a shop of four is recognisable by first
 * letter, and a placeholder that says nothing is worse than one that says «Б».
 */
function Avatar({ name, photo }: { name: string; photo: string | null }): React.JSX.Element {
  const theme = useAppTheme();
  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={avatarStyles.photo}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View style={[avatarStyles.photo, { backgroundColor: theme.colors.primaryContainer }]}>
      <Text style={[avatarStyles.initial, { color: theme.colors.onPrimaryContainer }]}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  photo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 13, fontWeight: '900' },
});

export function ChatScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const navigation = useNavigation<Nav>();
  const { displayName, can } = useAuth();
  const { showError } = useToast();
  const { gutter } = useResponsive();
  const { isOffline, employees } = useData();

  /**
   * Name → photo, built once rather than searched per message.
   *
   * Case-folded because a message carries the display name as it was typed and
   * the employee record carries it as entered; «бат» and «Бат» are one person.
   */
  const photos = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees) {
      const photo = employee.photo;
      if (photo) map.set(employee.name.trim().toLowerCase(), photo);
    }
    return map;
  }, [employees]);
  const photoOf = useCallback(
    (name: string): string | null => photos.get(name.trim().toLowerCase()) ?? null,
    [photos],
  );
  const {
    messages,
    deviceId,
    isLoading,
    isRefreshing,
    hasSyncError,
    pendingCount,
    refresh,
    send,
    sendImage,
    remove,
    setActive,
  } = useChat();

  // Tells the provider to poll fast and to stop raising notifications for a
  // conversation the user is looking at.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [setActive]),
  );

  const [draft, setDraft] = useState('');
  const [attaching, setAttaching] = useState(false);
  /**
   * Two-tap delete.
   *
   * The bin now sits beside every message the user may remove, rather than
   * appearing after a long press nobody discovered. That makes it one tap from
   * a chat history, so the first tap only arms it — the icon fills in, the
   * bubble takes a red border, and a second tap within two seconds deletes.
   */
  const { armedId, confirm } = useConfirmAction<string>();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  /**
   * Auto-scrolling on every content change would yank the view back down each
   * time a poll lands, so it only happens when the reader is already at the
   * bottom — or when they just sent something themselves.
   */
  const atBottom = useRef(true);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const handleContentChange = useCallback(() => {
    if (atBottom.current) scrollToEnd();
  }, [scrollToEnd]);

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;
    send(draft, displayName);
    setDraft('');
    atBottom.current = true;
    scrollToEnd();
  }, [draft, displayName, send, scrollToEnd]);

  const handleDelete = useCallback(
    (message: ChatMessage) => confirm(message.id, () => remove(message)),
    [confirm, remove],
  );

  const attach = useCallback(
    async (fromCamera: boolean) => {
      setAttaching(true);
      const result = fromCamera ? await captureImage() : await pickImageFromLibrary();
      setAttaching(false);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      if (result.value === null) return;
      sendImage(result.value, displayName);
      scrollToEnd();
    },
    [displayName, sendImage, showError, scrollToEnd],
  );

  const canModerate = can('manageEmployees');

  const subtitle = useMemo(() => {
    if (isOffline) return `${displayName} · офлайн`;
    if (pendingCount > 0) return `${displayName} · ${pendingCount} илгээгдэж байна`;
    if (hasSyncError) return `${displayName} · холбогдож чадсангүй`;
    return `${displayName} · бүх төхөөрөмж`;
  }, [displayName, isOffline, pendingCount, hasSyncError]);

  /**
   * How far to lift the composer so the keyboard cannot cover it.
   *
   * `KeyboardAvoidingView` used to do this, and it stopped working. On Android
   * it never did anything on its own — it relies on the window resizing when
   * the keyboard opens, and SDK 54 draws edge to edge, so the window keeps its
   * full height and the keyboard simply lies on top of the composer. On iOS the
   * offset had to be guessed from the header height, which differs between a
   * phone and an iPad.
   *
   * Measuring the keyboard itself sidesteps both. The bottom safe-area inset is
   * taken off because `Screen` already reserves it, and the tab bar is set to
   * hide while typing, so nothing else sits underneath.
   */
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lift = Math.max(0, keyboardHeight - insets.bottom);

  useEffect(() => {
    // iOS reports the keyboard before it animates in, Android only after.
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
        // The list shrinks as the composer rises; without this the newest
        // message slides out of view exactly when you start replying to it.
        if (atBottom.current) scrollToEnd();
      },
    );
    const hidden = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [scrollToEnd]);

  return (
    <Screen>
      <View>
        <ScreenHeader title="Дотоод чат" subtitle={subtitle} onBack={onBack} />

        {hasSyncError && !isOffline ? (
          <Pressable onPress={() => void refresh(true)} style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              ⚠️ Серверт холбогдож чадсангүй. Мессеж энэ утсанд хадгалагдаж, дараа
              илгээгдэнэ. Дахин оролдохын тулд дарна уу.
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.flex, { paddingBottom: lift }]}>
        {isLoading ? (
          <LoadingState />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
            onContentSizeChange={handleContentChange}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              atBottom.current =
                contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
            }}
            scrollEventThrottle={80}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={11}
            removeClippedSubviews
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh(true)} />
            }
            ListEmptyComponent={
              <EmptyState
                icon="💬"
                title="Мессеж алга"
                hint="Доорх талбарт бичээд илгээнэ үү. Бүх төхөөрөмж дээр харагдана."
              />
            }
            renderItem={({ item, index }) => {
              const isMe = isOwnMessage(item, deviceId, displayName);
              const previous = index > 0 ? messages[index - 1] : undefined;
              const showDay =
                previous === undefined ||
                toDateString(new Date(previous.at)) !== toDateString(new Date(item.at));
              // Consecutive messages from one device only need one name — and
              // one face. A photo on every line of a five-message burst is
              // five copies of the same head down the margin.
              const showSender = !isMe && previous?.deviceId !== item.deviceId;
              const canDelete = isMe || canModerate;
              /** Armed by the first tap on the bin; the second tap deletes. */
              const armed = armedId === item.id;

              return (
                <View>
                  {showDay ? (
                    <Text style={[styles.day, { color: theme.custom.mutedText }]}>
                      {dayLabel(item.at)}
                    </Text>
                  ) : null}

                  <View
                    accessibilityLabel={`${item.sender}: ${item.text}`}
                    style={[styles.bubbleRow, isMe ? styles.mine : styles.theirs]}
                  >
                    {/* Own messages sit on the right, so their bin goes on the
                        left — on either side it ends up on the outer edge,
                        away from the thumb resting over the text. */}
                    {/* The sender's own photo, off their employee record.
                        Matched by name because that is what a message carries:
                        the device id says which handset, and the counter iPad
                        is everybody's. Falls back to an initial rather than a
                        grey circle — a shop of four is recognisable by first
                        letter, and a placeholder that says nothing is worse
                        than one that says «Б». */}
                    {!isMe ? (
                      <View style={styles.avatarSlot}>
                        {showSender ? (
                          <Avatar name={item.sender} photo={photoOf(item.sender)} />
                        ) : null}
                      </View>
                    ) : null}

                    {canDelete && isMe ? (
                      <IconButton
                        icon={armed ? 'trash-can' : 'trash-can-outline'}
                        size={18}
                        iconColor={armed ? '#dc2626' : theme.custom.mutedText}
                        style={styles.trash}
                        onPress={() => handleDelete(item)}
                        accessibilityLabel={
                          armed ? `${item.sender}-ийн мессежийг устгахыг батлах` : 'Устгах'
                        }
                      />
                    ) : null}

                    <View
                      style={[
                        styles.bubble,
                        {
                          backgroundColor: isMe
                            ? theme.colors.primary
                            : theme.custom.cardBackground,
                          borderColor: armed ? '#dc2626' : theme.custom.subtleBorder,
                          borderWidth: armed ? 1.5 : StyleSheet.hairlineWidth,
                          opacity: item.pending ? 0.75 : 1,
                        },
                      ]}
                    >
                      {showSender ? (
                        <Text style={[styles.sender, { color: theme.colors.primary }]}>
                          {item.sender}
                        </Text>
                      ) : null}

                      {item.image ? (
                        <Pressable
                          onPress={() =>
                            item.image
                              ? navigation.navigate('ImageViewer', { uri: item.image })
                              : undefined
                          }
                        >
                          <Image
                            source={{ uri: item.image }}
                            style={styles.image}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        </Pressable>
                      ) : null}

                      {item.text ? (
                        <Text
                          style={[
                            styles.text,
                            { color: isMe ? '#ffffff' : theme.colors.onSurface },
                          ]}
                        >
                          {item.text}
                        </Text>
                      ) : null}

                      <Text
                        style={[
                          styles.time,
                          {
                            color: isMe ? 'rgba(255,255,255,0.7)' : theme.custom.mutedText,
                          },
                        ]}
                      >
                        {armed
                          ? 'Устгах уу? Дахин дарна уу'
                          : `${item.time}${item.pending ? ' ⏳' : ''}${
                              item.legacy ? ' · зөвхөн энэ төхөөрөмжид' : ''
                            }`}
                      </Text>
                    </View>

                    {canDelete && !isMe ? (
                      <IconButton
                        icon={armed ? 'trash-can' : 'trash-can-outline'}
                        size={18}
                        iconColor={armed ? '#dc2626' : theme.custom.mutedText}
                        style={styles.trash}
                        onPress={() => handleDelete(item)}
                        accessibilityLabel={
                          armed ? `${item.sender}-ийн мессежийг устгахыг батлах` : 'Устгах'
                        }
                      />
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        )}

        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.custom.cardBackground,
              borderTopColor: theme.custom.subtleBorder,
            },
          ]}
        >
          <IconButton
            icon="image"
            disabled={attaching}
            onPress={() => void attach(false)}
            accessibilityLabel="Зураг илгээх"
          />
          <IconButton
            icon="camera"
            disabled={attaching}
            onPress={() => void attach(true)}
            accessibilityLabel="Зураг авах"
          />
          <TextInput
            mode="outlined"
            value={draft}
            onChangeText={setDraft}
            placeholder="Мессеж бичих..."
            style={styles.input}
            dense
            multiline
            onSubmitEditing={handleSend}
          />
          <IconButton
            icon="send"
            mode="contained"
            disabled={!draft.trim()}
            onPress={handleSend}
            accessibilityLabel="Илгээх"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  errorBanner: { backgroundColor: '#fef3c7', paddingHorizontal: 16, paddingVertical: 8 },
  errorBannerText: { color: '#92400e', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  list: { paddingVertical: 12, gap: 8, flexGrow: 1 },
  day: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 6,
    letterSpacing: 0.4,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  /* Held open even on a follow-up message so the bubbles below the first one
     stay aligned with it instead of sliding left under the face. */
  avatarSlot: { width: 34, alignItems: 'flex-start' },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  trash: { margin: 0 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  sender: { fontSize: 10, fontWeight: '800' },
  text: { fontSize: 14, lineHeight: 19 },
  time: { fontSize: 9, alignSelf: 'flex-end' },
  image: { width: 200, height: 150, borderRadius: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  input: { flex: 1, maxHeight: 110 },
});
