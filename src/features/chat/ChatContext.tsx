import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/authentication/AuthContext';
import { CHAT_BACKGROUND_POLL_MS, CHAT_POLL_MS } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import { getDeviceId } from '@/services/device/deviceId';
import { isOnline, subscribeConnectivity } from '@/services/network/connectivity';
import { notifyChatMessage } from '@/services/notifications/notificationService';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import type { ChatMessage } from '@/types';
import { nowTimeString } from '@/utils/date';
import { logger } from '@/utils/logger';

import { chatRepository, isOwnMessage, mergeMessages } from './chatRepository';

/**
 * The shop's group chat.
 *
 * One shared room, no accounts: the sender is whoever is logged in on that
 * device (Менежер / iPad / ажилтны нэр) and "mine" is decided by a random
 * per-install id. Messages live under `/pmn/chat/<id>` in Firebase, so every
 * device sees the same history.
 *
 * This is a provider rather than a screen-local hook because two things have to
 * keep working while the chat is closed: the unread badge on the tab, and the
 * notification that tells somebody a message arrived at all. Polling runs fast
 * while the chat is open and slowly otherwise, and stops entirely when the app
 * is backgrounded.
 *
 * Delivery is optimistic. A new message appears instantly, goes into an outbox
 * that survives a restart, and is retried whenever a poll runs or the
 * connection comes back.
 */

interface ChatContextValue {
  messages: ChatMessage[];
  /** This device's id — compare with `message.deviceId` to find own bubbles. */
  deviceId: string;
  isLoading: boolean;
  /** True only for a pull-to-refresh; background polls stay invisible. */
  isRefreshing: boolean;
  /** Set when the last pull failed; the cached history is still shown. */
  hasSyncError: boolean;
  pendingCount: number;
  unreadCount: number;
  refresh: (manual?: boolean) => Promise<void>;
  send: (text: string, sender: string) => void;
  sendImage: (uri: string, sender: string) => void;
  remove: (message: ChatMessage) => void;
  /** Called by the chat screen as it gains and loses focus. */
  setActive: (active: boolean) => void;
  markRead: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const makeId = (deviceId: string, at: number): string =>
  `${at}-${deviceId.slice(-6)}-${Math.random().toString(36).slice(2, 7)}`;

/** Most banners raised by one poll; the rest are summarised into one. */
const NOTIFY_BURST_LIMIT = 5;

export function ChatProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Ownership follows the signed-in name as well as the device, so the unread
  // count and notifications agree with what the screen paints as "mine".
  const { displayName } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSyncError, setHasSyncError] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isActive, setIsActive] = useState(false);

  // Mirrored in refs so the polling loop and the send path can read the latest
  // value without re-creating their callbacks.
  const outboxRef = useRef<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const deviceIdRef = useRef('');
  const lastReadAtRef = useRef(0);
  const activeRef = useRef(false);
  const inFlight = useRef(false);

  const nameRef = useRef(displayName);
  nameRef.current = displayName;

  const recountUnread = useCallback(() => {
    const unread = messagesRef.current.filter(
      (message) =>
        !isOwnMessage(message, deviceIdRef.current, nameRef.current) &&
        message.at > lastReadAtRef.current,
    ).length;
    setUnreadCount(unread);
  }, []);

  /**
   * A poll that returns the same history must not touch state — otherwise the
   * list re-renders every few seconds and the view visibly jumps.
   */
  const applyMessages = useCallback(
    (next: ChatMessage[]) => {
      const previous = messagesRef.current;
      const unchanged =
        previous.length === next.length &&
        previous.every((message, index) => {
          const other = next[index];
          return (
            other !== undefined &&
            message.id === other.id &&
            message.pending === other.pending &&
            message.image === other.image
          );
        });
      if (unchanged) return;

      messagesRef.current = next;
      setMessages(next);
      recountUnread();
      void chatRepository.cache(next);
    },
    [recountUnread],
  );

  const setOutbox = useCallback((next: ChatMessage[]) => {
    outboxRef.current = next;
    setPendingCount(next.length);
    void chatRepository.writeOutbox(next);
  }, []);

  const markRead = useCallback(() => {
    const newest = messagesRef.current.reduce((max, message) => Math.max(max, message.at), 0);
    lastReadAtRef.current = Math.max(lastReadAtRef.current, newest);
    void writeJson(STORAGE_KEYS.chatLastRead, lastReadAtRef.current);
    setUnreadCount(0);
  }, []);

  /** Pushes everything queued, dropping each message as the server accepts it. */
  const flushOutbox = useCallback(async (): Promise<void> => {
    if (outboxRef.current.length === 0 || !isOnline()) return;

    const queued = [...outboxRef.current];
    const stillQueued: ChatMessage[] = [];

    for (const message of queued) {
      const result = await chatRepository.publish(message);
      if (!result.ok) {
        stillQueued.push(message);
        if (result.error.kind === 'permission') {
          // Rejected by the database rules; every later message would be too.
          setHasSyncError(true);
          logger.error(
            'chat: Firebase rejected the message. Check the database rules and ' +
              'expo.extra.rtdbAuth — queued messages are kept, not lost.',
          );
          break;
        }
        logger.warn('chat: publish failed, keeping in outbox', result.error);
      }
    }

    // Anything after an aborted loop has not been attempted yet; keep it queued.
    const attempted = new Set(queued.map((m) => m.id));
    const remaining = [
      ...stillQueued,
      ...outboxRef.current.filter((m) => !attempted.has(m.id)),
    ];
    setOutbox(remaining);

    // Clear the ⏳ on anything that made it through.
    const sent = new Set(
      queued.filter((m) => !remaining.some((q) => q.id === m.id)).map((m) => m.id),
    );
    if (sent.size > 0) {
      applyMessages(
        messagesRef.current.map((m) => (sent.has(m.id) ? { ...m, pending: false } : m)),
      );
    }
  }, [applyMessages, setOutbox]);

  /** Sends anything queued, then pulls the room and merges. */
  const refresh = useCallback(
    async (manual = false): Promise<void> => {
      if (inFlight.current) return;
      const myDeviceId = deviceIdRef.current;
      if (myDeviceId === '') return;

      inFlight.current = true;
      if (manual) setIsRefreshing(true);

      try {
        await flushOutbox();

        if (!isOnline()) {
          setHasSyncError(false);
          return;
        }

        const result = await chatRepository.fetchRemote(myDeviceId);
        if (!result.ok) {
          setHasSyncError(true);
          return;
        }
        setHasSyncError(false);

        // Local-only rows (legacy history and anything still queued) survive
        // the merge; everything else is whatever the server currently holds.
        const localOnly = messagesRef.current.filter(
          (message) => message.legacy === true || message.pending === true,
        );
        const merged = mergeMessages(result.value, localOnly);

        // Every message from another device raises its own notification, so a
        // conversation is not collapsed into a single banner. Suppressed only
        // while the chat itself is open — alerting somebody about the line they
        // are currently reading is pure noise.
        if (!activeRef.current) {
          const seen = new Set(messagesRef.current.map((message) => message.id));
          const fresh = merged.filter(
            (message) =>
              !isOwnMessage(message, myDeviceId, nameRef.current) &&
              message.at > lastReadAtRef.current &&
              !seen.has(message.id),
          );

          // Coming back after a long absence should not fire twenty banners.
          const shown = fresh.slice(-NOTIFY_BURST_LIMIT);
          for (const message of shown) {
            void notifyChatMessage(message.sender, message.text || 'Зураг илгээлээ');
          }
          if (fresh.length > shown.length) {
            void notifyChatMessage(
              'Дотоод чат',
              `+${fresh.length - shown.length} мессеж уншаагүй байна`,
            );
          }
        }

        applyMessages(merged);
        if (activeRef.current) markRead();

        void chatRepository.prune(result.value);
      } finally {
        inFlight.current = false;
        if (manual) setIsRefreshing(false);
      }
    },
    [applyMessages, flushOutbox, markRead],
  );

  /**
   * Boot: identity, last-read marker, cached history, queued messages.
   *
   * Deliberately has no "run once" ref guard. React invokes an effect twice on
   * mount in development, and a guard set on the first pass makes the second
   * pass return early — while the first pass has already been cancelled by its
   * own cleanup. The result was a chat that never got a device id and so could
   * neither load nor send. Re-running is harmless here; being skipped is not.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const id = await getDeviceId();
        if (cancelled) return;
        deviceIdRef.current = id;
        setDeviceId(id);

        const [cached, outbox, lastRead] = await Promise.all([
          chatRepository.readLocal(id),
          chatRepository.readOutbox(id),
          readJson<number>(STORAGE_KEYS.chatLastRead, 0),
        ]);
        if (cancelled) return;

        lastReadAtRef.current = typeof lastRead === 'number' ? lastRead : 0;
        outboxRef.current = outbox;
        setPendingCount(outbox.length);
        messagesRef.current = mergeMessages(cached, outbox);
        setMessages(messagesRef.current);
        recountUnread();

        void refresh();
      } catch (error) {
        // Storage failure must not leave the screen spinning forever; an empty
        // chat that can still send is far better than a dead one.
        logger.error('chat: boot failed', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, recountUnread]);

  // Fast polling while the chat is open, slower while it is closed — but never
  // stopped, because a closed chat is exactly when a message needs to raise a
  // notification.
  useEffect(() => {
    const period = isActive ? CHAT_POLL_MS : CHAT_BACKGROUND_POLL_MS;
    const interval = setInterval(() => void refresh(), period);
    return () => clearInterval(interval);
  }, [isActive, refresh]);

  // Timers are frozen while the app is suspended, so anything sent in the
  // meantime is picked up — and announced — the instant it is reopened.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Reconnecting is the moment queued messages should go out.
  useEffect(
    () =>
      subscribeConnectivity((online) => {
        if (online) void refresh();
      }),
    [refresh],
  );

  const setActive = useCallback(
    (active: boolean) => {
      activeRef.current = active;
      setIsActive(active);
      if (active) {
        markRead();
        void refresh();
      }
    },
    [markRead, refresh],
  );

  const append = useCallback(
    (message: ChatMessage) => {
      applyMessages(mergeMessages(messagesRef.current, [message]));
      setOutbox([...outboxRef.current, message]);
      void flushOutbox();
    },
    [applyMessages, setOutbox, flushOutbox],
  );

  /**
   * The id is normally in place long before anyone types, but a message tapped
   * out during the first moments after launch must not be thrown away — so the
   * send path waits for it rather than returning early.
   */
  const compose = useCallback(
    async (sender: string, text: string, image: string | null): Promise<void> => {
      const id = deviceIdRef.current === '' ? await getDeviceId() : deviceIdRef.current;
      deviceIdRef.current = id;
      const at = Date.now();
      append({
        id: makeId(id, at),
        sender,
        text,
        time: nowTimeString(),
        at,
        deviceId: id,
        image,
        pending: true,
      });
    },
    [append],
  );

  const send = useCallback(
    (text: string, sender: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      void compose(sender, trimmed, null);
    },
    [compose],
  );

  const sendImage = useCallback(
    (uri: string, sender: string) => {
      void compose(sender, '', uri);
    },
    [compose],
  );

  const remove = useCallback(
    (message: ChatMessage) => {
      applyMessages(messagesRef.current.filter((entry) => entry.id !== message.id));
      setOutbox(outboxRef.current.filter((entry) => entry.id !== message.id));
      void chatRepository.removeRemote(message);
    },
    [applyMessages, setOutbox],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      deviceId,
      isLoading,
      isRefreshing,
      hasSyncError,
      pendingCount,
      unreadCount,
      refresh,
      send,
      sendImage,
      remove,
      setActive,
      markRead,
    }),
    [
      messages,
      deviceId,
      isLoading,
      isRefreshing,
      hasSyncError,
      pendingCount,
      unreadCount,
      refresh,
      send,
      sendImage,
      remove,
      setActive,
      markRead,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
