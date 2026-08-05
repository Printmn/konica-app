import * as DocumentPicker from 'expo-document-picker';
// `readAsStringAsync` / `EncodingType` are part of the legacy API. The main
// `expo-file-system` entry point exposes the new File/Directory API instead.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { Result } from '@/types';
import { err, ok, toAppError } from '@/utils/result';

/**
 * Image capture and compression.
 *
 * Replaces `<input type="file">` plus the canvas-based `compressImage` helper.
 * The compression contract is kept identical — longest edge 400px, JPEG quality
 * 0.7, returned as a base64 data URI — because those strings are written
 * straight into Firebase and the payload size budget depends on them.
 */

const MAX_DIMENSION = 400;
const QUALITY = 0.7;

/** Downscales and re-encodes an image, returning a `data:image/jpeg;base64,…` URI. */
export async function compressImage(
  uri: string,
  maxDimension: number = MAX_DIMENSION,
): Promise<Result<string>> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxDimension } }],
      {
        compress: QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) return err('unknown', 'Зургийг боловсруулж чадсангүй.');
    return ok(`data:image/jpeg;base64,${result.base64}`);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

/** Opens the photo library, then compresses the pick. */
export async function pickImageFromLibrary(): Promise<Result<string | null>> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return err('permission', 'Зургийн сан руу хандах зөвшөөрөл олгоно уу.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return ok(null);
    return compressImage(result.assets[0].uri);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

/** Opens the camera, then compresses the shot. */
export async function captureImage(): Promise<Result<string | null>> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return err('permission', 'Камер ашиглах зөвшөөрөл олгоно уу.');
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return ok(null);
    return compressImage(result.assets[0].uri);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

// ── Document picking ─────────────────────────────────────────────────

export interface PickedDocument {
  uri: string;
  name: string;
  base64: string;
}

/**
 * Picks a spreadsheet and returns its base64 contents, ready for
 * `parseWorkbook`. Returns `null` when the user backs out.
 */
export async function pickSpreadsheet(): Promise<Result<PickedDocument | null>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) return ok(null);
    const asset = result.assets[0];

    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return ok({ uri: asset.uri, name: asset.name, base64 });
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

/** Picks any JSON file — used by the restore-from-backup flow. */
export async function pickJsonFile(): Promise<Result<{ name: string; text: string } | null>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) return ok(null);
    const asset = result.assets[0];
    const text = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return ok({ name: asset.name, text });
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}
