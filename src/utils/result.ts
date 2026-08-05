import type { AppError, AppErrorKind, Result } from '@/types';

/**
 * A tiny Result type so the service layer never throws across a boundary.
 * Screens branch on `result.ok` and always have a typed error to render.
 */

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T = never>(
  kind: AppErrorKind,
  message: string,
  cause?: unknown,
): Result<T> => ({ ok: false, error: { kind, message, cause } });

/** Human-readable Mongolian copy for each failure mode. */
export const errorMessage = (error: AppError): string => {
  switch (error.kind) {
    case 'network':
      return 'Сүлжээнд холбогдож чадсангүй. Офлайн горимд ажиллаж байна.';
    case 'permission':
      return 'Танд энэ үйлдлийг хийх эрх байхгүй байна.';
    case 'firebase':
      return 'Мэдээллийн сантай холбогдоход алдаа гарлаа.';
    case 'validation':
      return error.message;
    case 'storage':
      return 'Төхөөрөмж дээр хадгалахад алдаа гарлаа.';
    default:
      return error.message || 'Тодорхойгүй алдаа гарлаа.';
  }
};

/** Normalises anything thrown into an `AppError`. */
export const toAppError = (cause: unknown, fallbackKind: AppErrorKind = 'unknown'): AppError => {
  if (cause instanceof Error) {
    const isNetwork =
      cause.name === 'AbortError' ||
      cause.message.includes('Network request failed') ||
      cause.message.includes('timeout');
    return {
      kind: isNetwork ? 'network' : fallbackKind,
      message: cause.message,
      cause,
    };
  }
  return { kind: fallbackKind, message: String(cause), cause };
};
