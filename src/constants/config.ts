import Constants from 'expo-constants';

/**
 * Runtime configuration.
 *
 * The Realtime Database URL comes from `app.json → expo.extra.rtdbUrl` so it can
 * be swapped per build profile without touching code.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const RTDB_URL: string =
  typeof extra.rtdbUrl === 'string'
    ? extra.rtdbUrl
    : 'https://printmn-c0d28-default-rtdb.firebaseio.com/pmn';

/**
 * Shared secret appended to every Realtime Database request as `?auth=`.
 *
 * Without it the database can only be protected by rules that allow the world
 * to read and write, since the REST endpoint carries no identity at all. Supply
 * it through `app.json → expo.extra.rtdbAuth` (or an EAS secret) and lock the
 * rules down to `auth != null`. Empty means "no token", which is only safe on a
 * database whose rules are already closed.
 */
export const RTDB_AUTH: string = typeof extra.rtdbAuth === 'string' ? extra.rtdbAuth : '';

/** How often the app pulls the whole dataset down, in ms. Matches the web app. */
export const SYNC_INTERVAL_MS = 30_000;

/** Network timeout for a single Realtime Database request. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Retry backoff for queued writes, in ms. */
export const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000] as const;
export const MAX_WRITE_ATTEMPTS = 6;

/** Bonus ceiling used by the monthly performance calculation. */
export const MAX_MONTHLY_BONUS = 100_000;

/** VAT rate applied to prices flagged with `hasVat`. */
export const VAT_RATE = 0.1;

/** `id` of the "Цагтаа ирэх" habit — auto-checked when the arrival is on time. */
export const ARRIVE_TASK_ID = 4;

/** Stock at or below this number raises a low-stock warning. */
export const LOW_STOCK_THRESHOLD = 5;

/** Categories that open the free-price ("тохиролцоо") modal instead of a fixed price. */
export const CUSTOM_PRICE_CATEGORIES = ['Медаль & Цом', 'Хувцас хэвлэл'] as const;

/** Page size for the paginated work-log / attendance lists. */
export const PAGE_SIZE = 30;

// ── Group chat ───────────────────────────────────────────────────────

/** How often the open chat screen pulls new messages, in ms. */
export const CHAT_POLL_MS = 5_000;

/**
 * Cadence while the chat is closed. Fast enough that a notification still feels
 * like it arrived when the message was sent, slow enough not to matter for
 * battery or data — one small GET.
 */
export const CHAT_BACKGROUND_POLL_MS = 12_000;

/** Messages kept in the shared history; older ones are pruned server-side. */
export const CHAT_HISTORY_LIMIT = 200;

/** Pruning only kicks in once the history exceeds this, to avoid churn. */
export const CHAT_PRUNE_THRESHOLD = 300;
