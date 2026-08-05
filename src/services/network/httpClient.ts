import { REQUEST_TIMEOUT_MS } from '@/constants/config';
import type { Result } from '@/types';
import { err, ok, toAppError } from '@/utils/result';

/**
 * `fetch` with a timeout and a Result return.
 *
 * React Native's fetch has no default timeout, so a dead connection would hang
 * a request forever. AbortController fixes that; every caller gets a typed
 * error instead of a rejected promise.
 */

interface RequestOptions {
  method?: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<Result<T>> {
  const { method = 'GET', body, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Let a caller-supplied signal also cancel this request.
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 401/403 mean the database rules rejected us, not that the network
      // failed. Callers must be able to tell the two apart: a transient
      // failure is worth retrying and eventually giving up on, whereas a
      // rejected write will be rejected identically forever and must be kept.
      const kind = response.status === 401 || response.status === 403 ? 'permission' : 'firebase';
      return err(kind, `HTTP ${response.status} ${response.statusText}`.trim());
    }

    const text = await response.text();
    if (text.length === 0) return ok(null as T);
    return ok(JSON.parse(text) as T);
  } catch (cause) {
    const error = toAppError(cause, 'network');
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}
