import { File } from 'expo-file-system';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { pickJsonFile } from '@/services/media/imageService';
import { documentsDirectory, shareFile, writeTextFile } from '@/services/export/fileService';
import { readJson, readManyJson, writeJson } from '@/services/storage/asyncStorage';
import type { Result } from '@/types';
import { todayString } from '@/utils/date';
import { logger } from '@/utils/logger';
import { err, ok, toAppError } from '@/utils/result';

/**
 * Backup and restore.
 *
 * A backup is a single JSON file holding every cached collection. It is written
 * to the documents directory and shared, so the manager can park it in Drive or
 * Telegram. Restore reads one back, validates the envelope, and rewrites the
 * caches — the next sync then pushes everything to Firebase.
 */

const BACKUP_VERSION = 2;

/** How long an automatic backup stays fresh before another is written. */
const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Automatic copies kept on the device before the oldest is discarded. */
const AUTO_BACKUP_KEEP = 4;

const BACKED_UP_KEYS = [
  STORAGE_KEYS.orders,
  STORAGE_KEYS.workLogs,
  STORAGE_KEYS.attendanceLogs,
  STORAGE_KEYS.employees,
  STORAGE_KEYS.colorLabels,
  STORAGE_KEYS.calcTypes,
  STORAGE_KEYS.timeSettings,
  STORAGE_KEYS.inventory,
  STORAGE_KEYS.services,
  STORAGE_KEYS.tasks,
  STORAGE_KEYS.chatMessages,
] as const;

interface BackupEnvelope {
  version: number;
  createdAt: string;
  app: 'printmn-konica';
  data: Record<string, unknown>;
}

const isEnvelope = (raw: unknown): raw is BackupEnvelope =>
  typeof raw === 'object' &&
  raw !== null &&
  'version' in raw &&
  'data' in raw &&
  typeof (raw as BackupEnvelope).data === 'object';

/** Writes a backup file and opens the share sheet. */
export async function createBackup(): Promise<Result<string>> {
  try {
    const data = await readManyJson(BACKED_UP_KEYS);
    const envelope: BackupEnvelope = {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      app: 'printmn-konica',
      data,
    };

    const fileName = `printmn-backup-${todayString()}.json`;
    const written = await writeTextFile(fileName, JSON.stringify(envelope, null, 2));
    if (!written.ok) return written;

    await writeJson(STORAGE_KEYS.lastBackup, envelope.createdAt);

    const shared = await shareFile(written.value, 'json', 'Нөөц хуулбар');
    if (!shared.ok) return { ok: false, error: shared.error };
    return ok(written.value);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'storage') };
  }
}

/**
 * Weekly, silent, on-device backup.
 *
 * `createBackup` opens the share sheet, which means it only ever runs when
 * somebody remembers to press the button — and nobody does until the data is
 * already gone. This one writes to the app's documents directory with no UI at
 * all, keeps the last few copies, and returns `false` when a backup is not yet
 * due. The manager can still share any of them from Settings.
 */
export async function autoBackupIfDue(): Promise<boolean> {
  try {
    const last = await readJson<string | null>(STORAGE_KEYS.lastBackup, null);
    if (typeof last === 'string') {
      const age = Date.now() - new Date(last).getTime();
      if (Number.isFinite(age) && age < AUTO_BACKUP_INTERVAL_MS) return false;
    }

    const data = await readManyJson(BACKED_UP_KEYS);
    const envelope: BackupEnvelope = {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      app: 'printmn-konica',
      data,
    };

    const written = await writeTextFile(
      `printmn-auto-backup-${todayString()}.json`,
      JSON.stringify(envelope),
    );
    if (!written.ok) return false;

    await writeJson(STORAGE_KEYS.lastBackup, envelope.createdAt);
    pruneAutoBackups();
    return true;
  } catch (cause) {
    logger.warn('auto backup failed', cause);
    return false;
  }
}

/** Drops all but the newest few automatic copies. */
function pruneAutoBackups(): void {
  try {
    const files = documentsDirectory()
      .list()
      .filter((entry) => entry.name.startsWith('printmn-auto-backup-'))
      .map((entry) => entry.name)
      .sort();

    for (const name of files.slice(0, Math.max(0, files.length - AUTO_BACKUP_KEEP))) {
      const file = new File(documentsDirectory(), name);
      if (file.exists) file.delete();
    }
  } catch (cause) {
    logger.warn('auto backup prune failed', cause);
  }
}

export interface RestoreSummary {
  restoredKeys: string[];
  createdAt: string;
}

/**
 * Restores from a user-picked backup file.
 *
 * Returns `null` when the picker was dismissed. The caller should reload the
 * app state afterwards so the UI reflects the restored caches.
 */
export async function restoreBackup(): Promise<Result<RestoreSummary | null>> {
  const picked = await pickJsonFile();
  if (!picked.ok) return picked;
  if (picked.value === null) return ok(null);

  try {
    const parsed: unknown = JSON.parse(picked.value.text);
    if (!isEnvelope(parsed)) {
      return err('validation', 'Энэ файл Printmn-ийн нөөц хуулбар биш байна.');
    }
    if (parsed.version > BACKUP_VERSION) {
      return err('validation', 'Нөөц хуулбар илүү шинэ хувилбарынх байна. Аппаа шинэчилнэ үү.');
    }

    const restoredKeys: string[] = [];
    for (const key of BACKED_UP_KEYS) {
      const value = parsed.data[key];
      if (value === undefined) continue;
      await writeJson(key, value);
      restoredKeys.push(key);
    }

    return ok({ restoredKeys, createdAt: parsed.createdAt });
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'validation') };
  }
}
