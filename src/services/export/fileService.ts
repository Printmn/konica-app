import { type Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { readJson, removeKey, writeJson } from '@/services/storage/asyncStorage';
import type { Result } from '@/types';
import { base64ToBytes } from '@/utils/base64';
import { logger } from '@/utils/logger';
import { err, ok, toAppError } from '@/utils/result';

/**
 * File write + share.
 *
 * Replaces the web build's `XLSX.writeFile` / `pdf.save` / `link.click()`
 * download trick. On a phone there is no download folder to speak of, so the
 * file is written into the app's document directory and handed to the OS share
 * sheet — the user then picks Files, Drive, Telegram, or anything else.
 *
 * Note this uses the object-oriented `File` / `Paths` API introduced in
 * expo-file-system 18 (SDK 54+). The older `documentDirectory` string and
 * `writeAsStringAsync` helpers now live in `expo-file-system/legacy`.
 */

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  png: 'image/png',
  json: 'application/json',
  csv: 'text/csv',
  txt: 'text/plain',
} as const;

/**
 * iOS identifies file types by UTI, not MIME. Without one the share sheet can
 * open with almost nothing in it, or refuse the file outright — which is why
 * exporting worked on Android but failed on an iPhone. Only `pdf` used to be
 * declared here.
 */
const UTI = {
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
  pdf: 'com.adobe.pdf',
  png: 'public.png',
  json: 'public.json',
  csv: 'public.comma-separated-values-text',
  txt: 'public.plain-text',
} as const;

export type ExportKind = keyof typeof MIME;

/** The directory exported documents are written to. */
export const documentsDirectory = (): Directory => Paths.document;

/**
 * Strips characters that are legal in a Mongolian label but not in a file name.
 * A stray `/` or `:` makes the write fail rather than the name look odd.
 */
const safeName = (fileName: string): string =>
  fileName.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');

/** Creates (or truncates) the target file and returns the handle. */
function prepare(fileName: string): File {
  const file = new File(Paths.document, safeName(fileName));
  if (file.exists) file.delete();
  // `overwrite` guards the race where the delete above did not take effect;
  // without it `create` throws on an existing file instead of replacing it.
  file.create({ intermediates: true, overwrite: true });
  return file;
}

/** Writes base64 content to `<documents>/<fileName>` and returns the URI. */
export async function writeBase64File(
  fileName: string,
  base64: string,
): Promise<Result<string>> {
  try {
    const file = prepare(fileName);
    // One argument only — see `base64ToBytes` for why the encoding option is
    // not passed here.
    file.write(base64ToBytes(base64));
    return ok(file.uri);
  } catch (cause) {
    logger.error(`writeBase64File failed for "${fileName}"`, cause);
    return { ok: false, error: toAppError(cause, 'storage') };
  }
}

/** Writes UTF-8 text (used for JSON backups and CSV). */
export async function writeTextFile(
  fileName: string,
  contents: string,
): Promise<Result<string>> {
  try {
    const file = prepare(fileName);
    file.write(contents);
    return ok(file.uri);
  } catch (cause) {
    logger.error(`writeTextFile failed for "${fileName}"`, cause);
    return { ok: false, error: toAppError(cause, 'storage') };
  }
}

export async function readTextFile(uri: string): Promise<Result<string>> {
  try {
    const file = new File(uri);
    return ok(await file.text());
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'storage') };
  }
}

export async function readBase64File(uri: string): Promise<Result<string>> {
  try {
    const file = new File(uri);
    return ok(await file.base64());
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'storage') };
  }
}

/** Opens the OS share sheet for a file already on disk. */
export async function shareFile(
  uri: string,
  kind: ExportKind,
  dialogTitle: string,
): Promise<Result<true>> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      // True on the iOS Simulator, which has no share sheet at all — the most
      // common reason an export that works on Android "fails on iPhone".
      logger.error(`shareFile: sharing unavailable on this device (${uri})`);
      return err(
        'unknown',
        'Энэ төхөөрөмж дээр хуваалцах цонх нээгдэхгүй байна. ' +
          'Симулятор дээр ажиллахгүй — жинхэнэ утсан дээр туршина уу.',
      );
    }

    await Sharing.shareAsync(uri, {
      mimeType: MIME[kind],
      dialogTitle,
      UTI: UTI[kind],
    });
    return ok(true);
  } catch (cause) {
    logger.error(`shareFile failed for "${uri}" (${kind})`, cause);
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

/**
 * Saves straight into a folder the shop chose, on Android.
 *
 * The share sheet is the only option iOS offers, but on Android it is a detour:
 * an export is something you keep, and going through "share → save to Files"
 * every day for the daily report is three taps that never change. The Storage
 * Access Framework lets the folder be picked once — Downloads, say — and every
 * export after that lands there silently.
 *
 * Returns `null` when this route is unavailable, so the caller falls back to
 * sharing rather than failing. That covers iOS, a refused permission, and a
 * folder that has since been deleted or had its access revoked; in the last
 * case the remembered folder is forgotten so the next export asks again
 * instead of failing forever.
 */
async function saveToChosenFolder(
  fileName: string,
  base64: string,
  kind: ExportKind,
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;

  let folder = await readJson<string>(STORAGE_KEYS.exportFolder, '');

  if (folder === '') {
    try {
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return null;
      folder = permission.directoryUri;
      await writeJson(STORAGE_KEYS.exportFolder, folder);
    } catch (cause) {
      logger.warn('Could not ask for an export folder', cause);
      return null;
    }
  }

  try {
    const uri = await StorageAccessFramework.createFileAsync(
      folder,
      safeName(fileName),
      MIME[kind],
    );
    await StorageAccessFramework.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    return uri;
  } catch (cause) {
    logger.warn(`Saving into the chosen folder failed for "${fileName}"`, cause);
    // The folder is gone or access was withdrawn. Forget it so the next export
    // offers the picker again, and share this one so nothing is lost now.
    await removeKey(STORAGE_KEYS.exportFolder);
    return null;
  }
}

/** Forgets the export folder, so the next export asks for one again. */
export async function clearExportFolder(): Promise<void> {
  await removeKey(STORAGE_KEYS.exportFolder);
}

/** Write-then-share, the shape almost every export needs. */
export async function saveAndShare(
  fileName: string,
  base64: string,
  kind: ExportKind,
  dialogTitle: string,
): Promise<Result<string>> {
  const saved = await saveToChosenFolder(fileName, base64, kind);
  if (saved !== null) return ok(saved);

  const written = await writeBase64File(fileName, base64);
  if (!written.ok) return written;
  const shared = await shareFile(written.value, kind, dialogTitle);
  if (!shared.ok) return { ok: false, error: shared.error };
  return ok(written.value);
}

/** Same as `saveAndShare`, for content that is already plain text. */
export async function saveTextAndShare(
  fileName: string,
  text: string,
  kind: ExportKind,
  dialogTitle: string,
): Promise<Result<string>> {
  const written = await writeTextFile(fileName, text);
  if (!written.ok) return written;
  const shared = await shareFile(written.value, kind, dialogTitle);
  if (!shared.ok) return { ok: false, error: shared.error };
  return ok(written.value);
}

export function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup; a leftover temp file is not worth surfacing.
  }
}
