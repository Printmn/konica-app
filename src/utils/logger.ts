 

import { reportError } from '@/services/monitoring/crashReporter';

/**
 * Console wrapper that stays quiet in release builds.
 *
 * `error` is the exception: it always reaches `crashReporter`, so a crash in
 * production leaves a trace on the device even though nothing is printed.
 */

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (isDev) console.log(`[printmn] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (isDev) console.warn(`[printmn] ${message}`, ...args);
  },
  error: (message: string, error?: unknown): void => {
    if (isDev) console.error(`[printmn] ${message}`, error);
    reportError(message, error);
  },
};
