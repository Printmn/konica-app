// AsyncStorage is used directly rather than through `services/storage`, which
// logs failures through `logger` — and `logger` reports here. Going straight to
// the native module keeps that dependency cycle from forming.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/storageKeys';

/**
 * Crash and error reporting.
 *
 * `logger` goes silent in release builds, which meant a crash on the shop floor
 * left no trace at all — the manager could only say "it closed". Errors are now
 * kept in a small ring buffer on the device so they can be shared from
 * Settings, and forwarded to an external sink when one is installed.
 *
 * The sink is a seam rather than a dependency: call `setCrashSink` from
 * `App.tsx` once a Sentry (or Crashlytics) DSN exists, and nothing else in the
 * codebase has to change.
 */

export interface ErrorReport {
  at: number;
  message: string;
  context: string;
  stack: string | null;
}

type CrashSink = (report: ErrorReport) => void;

/** Enough history to explain a bad afternoon, small enough to never matter. */
const MAX_REPORTS = 50;

let sink: CrashSink | null = null;
let buffer: ErrorReport[] = [];
let hydrated = false;

export function setCrashSink(next: CrashSink | null): void {
  sink = next;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.errorLog);
    const stored: unknown = raw === null ? [] : JSON.parse(raw);
    buffer = Array.isArray(stored) ? (stored as ErrorReport[]).slice(-MAX_REPORTS) : [];
  } catch {
    buffer = [];
  }
  hydrated = true;
}

const persist = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.errorLog, JSON.stringify(buffer));
  } catch {
    // Out of space or storage unavailable — the in-memory buffer still works.
  }
};

const describe = (error: unknown): { message: string; stack: string | null } => {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  if (typeof error === 'string') return { message: error, stack: null };
  if (error === undefined || error === null) return { message: '', stack: null };
  try {
    return { message: JSON.stringify(error) ?? 'unserialisable error', stack: null };
  } catch {
    // A value that neither serialises nor stringifies safely; record the shape.
    return { message: `unserialisable ${typeof error}`, stack: null };
  }
};

/** Records an error. Never throws — reporting must not become the failure. */
export function reportError(context: string, error?: unknown): void {
  void (async () => {
    try {
      await hydrate();
      const { message, stack } = describe(error);
      const report: ErrorReport = { at: Date.now(), context, message, stack };

      buffer = [...buffer, report].slice(-MAX_REPORTS);
      await persist();
      sink?.(report);
    } catch {
      // Swallow: a failure to record a failure is not worth escalating.
    }
  })();
}

export async function readErrorLog(): Promise<ErrorReport[]> {
  await hydrate();
  return [...buffer].reverse();
}

export async function clearErrorLog(): Promise<void> {
  buffer = [];
  hydrated = true;
  await persist();
}

/** Plain-text dump, suitable for sharing to Telegram or e-mail. */
export async function formatErrorLog(): Promise<string> {
  const reports = await readErrorLog();
  if (reports.length === 0) return 'Алдаа бүртгэгдээгүй байна.';
  return reports
    .map((report) => {
      const when = new Date(report.at).toISOString();
      const stack = report.stack === null ? '' : `\n${report.stack}`;
      return `[${when}] ${report.context}\n${report.message}${stack}`;
    })
    .join('\n\n──────────\n\n');
}
