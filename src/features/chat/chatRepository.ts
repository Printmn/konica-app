import { CHAT_HISTORY_LIMIT, CHAT_PRUNE_THRESHOLD } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import { rtdbClient } from '@/firebase/rtdbClient';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import type { ChatMessage, Result } from '@/types';
import { nowTimeString } from '@/utils/date';
import { ok } from '@/utils/result';

/**
 * Storage for the shop's single group chat.
 *
 * Shape: `/pmn/chat/<id>` — one node per message rather than one array for the
 * whole room. That matters because the old array-per-collection write used by
 * every other repository is last-writer-wins, which would drop a message
 * whenever two devices sent within the same sync window.
 *
 * Everything is offline-first: a message is cached and shown immediately, then
 * pushed from an outbox that survives a restart.
 */

const REMOTE_KEY = 'chat' as const;

// ── Parsing ──────────────────────────────────────────────────────────

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Coerces one stored or remote entry into a message.
 *
 * Also upgrades rows written by the pre-sync build, which used a numeric `id`,
 * an `isMe` flag and no `deviceId`. Those only ever existed on one phone, so
 * they are kept as `legacy` and never pushed to the server.
 */
export function normaliseMessage(raw: unknown, myDeviceId: string): ChatMessage | null {
  if (!isRecord(raw)) return null;

  const text = str(raw.text);
  const image = typeof raw.image === 'string' && raw.image.length > 0 ? raw.image : null;
  if (text.length === 0 && image === null) return null;

  const legacy = raw.deviceId === undefined;
  const rawId = raw.id;
  const id =
    typeof rawId === 'string' && rawId.length > 0
      ? rawId
      : typeof rawId === 'number'
        ? String(rawId)
        : null;
  if (id === null) return null;

  const at =
    typeof raw.at === 'number'
      ? raw.at
      : typeof rawId === 'number'
        ? rawId
        : Number(id.split('-')[0]) || 0;

  // A legacy row flagged `isMe` came from this phone; anything else did not.
  const deviceId = legacy
    ? raw.isMe === true
      ? myDeviceId
      : `legacy:${str(raw.sender, '?')}`
    : str(raw.deviceId);

  const message: ChatMessage = {
    id,
    sender: str(raw.sender, 'Тодорхойгүй'),
    text,
    time: str(raw.time, nowTimeString(new Date(at || Date.now()))),
    at,
    deviceId,
    image,
  };

  return legacy ? { ...message, legacy: true } : message;
}

const byTime = (a: ChatMessage, b: ChatMessage): number => a.at - b.at;

/**
 * Whether a message belongs to whoever is holding the device.
 *
 * The device id alone is not enough. It is minted per install, so signing in on
 * a second phone — or simply reinstalling — made your own history appear as
 * somebody else's: grey bubbles on the left, no delete button. The sender name
 * stored on each message is the identity the shop actually recognises, so a
 * match on either counts.
 *
 * The known limitation is shared logins: two people signed in under the same
 * generic "Ажилтан" would each see the other's messages as their own. That is
 * the same limitation the shared PINs impose everywhere else, and giving each
 * worker their own employee record resolves it.
 */
export const isOwnMessage = (
  message: ChatMessage,
  deviceId: string,
  displayName: string,
): boolean => {
  if (deviceId !== '' && message.deviceId === deviceId) return true;
  return displayName !== '' && message.sender === displayName;
};

/** Newest `CHAT_HISTORY_LIMIT`, de-duplicated by id, oldest first. */
export function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const group of groups) {
    for (const message of group) byId.set(message.id, message);
  }
  return [...byId.values()].sort(byTime).slice(-CHAT_HISTORY_LIMIT);
}

/** What actually goes over the wire — client-only flags are stripped. */
const toRemote = (message: ChatMessage): Record<string, unknown> => ({
  id: message.id,
  sender: message.sender,
  text: message.text,
  time: message.time,
  at: message.at,
  deviceId: message.deviceId,
  image: message.image,
});

// ── Repository ───────────────────────────────────────────────────────

export const chatRepository = {
  /** Cached history, migrated if it was written by an older build. */
  async readLocal(myDeviceId: string): Promise<ChatMessage[]> {
    const raw = await readJson<unknown>(STORAGE_KEYS.chatMessages, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => normaliseMessage(entry, myDeviceId))
      .filter((entry): entry is ChatMessage => entry !== null)
      .sort(byTime);
  },

  /**
   * Caches the visible history. Images are dropped on the way in, exactly as
   * before — a handful of base64 photos would blow past the storage quota, and
   * they can always be pulled back from the server.
   */
  async cache(messages: ChatMessage[]): Promise<void> {
    await writeJson(
      STORAGE_KEYS.chatMessages,
      messages.slice(-CHAT_HISTORY_LIMIT).map((message) => ({ ...message, image: null })),
    );
  },

  /** Pulls the whole room. A missing node means "nobody has written yet". */
  async fetchRemote(myDeviceId: string, signal?: AbortSignal): Promise<Result<ChatMessage[]>> {
    const result = await rtdbClient.read<unknown>(REMOTE_KEY, signal);
    if (!result.ok) return result;
    if (!isRecord(result.value)) return ok([]);

    const messages = Object.values(result.value)
      .map((entry) => normaliseMessage(entry, myDeviceId))
      .filter((entry): entry is ChatMessage => entry !== null)
      .sort(byTime);

    return ok(messages);
  },

  /** Publishes one message under its own key. */
  async publish(message: ChatMessage): Promise<Result<unknown>> {
    return rtdbClient.writeChild(REMOTE_KEY, message.id, toRemote(message));
  },

  /** Removes one message for everyone. Legacy rows exist only locally. */
  async removeRemote(message: ChatMessage): Promise<Result<null>> {
    if (message.legacy) return ok(null);
    return rtdbClient.removeChild(REMOTE_KEY, message.id);
  },

  /**
   * Trims the room back to `CHAT_HISTORY_LIMIT` once it grows past the
   * threshold, so the node cannot expand without bound. Failures are ignored:
   * pruning is housekeeping, never something the sender should see fail.
   */
  async prune(remote: ChatMessage[]): Promise<number> {
    if (remote.length <= CHAT_PRUNE_THRESHOLD) return 0;
    const stale = remote.slice(0, remote.length - CHAT_HISTORY_LIMIT);
    await Promise.all(stale.map((message) => rtdbClient.removeChild(REMOTE_KEY, message.id)));
    return stale.length;
  },

  // ── Outbox ─────────────────────────────────────────────────────────

  async readOutbox(myDeviceId: string): Promise<ChatMessage[]> {
    const raw = await readJson<unknown>(STORAGE_KEYS.chatOutbox, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => normaliseMessage(entry, myDeviceId))
      .filter((entry): entry is ChatMessage => entry !== null)
      .map((entry) => ({ ...entry, pending: true }));
  },

  async writeOutbox(messages: ChatMessage[]): Promise<void> {
    await writeJson(STORAGE_KEYS.chatOutbox, messages.map(toRemote));
  },
};
