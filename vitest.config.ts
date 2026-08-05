import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure layers.
 *
 * Nothing here renders a component or touches a native module — the tests cover
 * the code where a mistake costs money or data: price and VAT arithmetic, the
 * daily report, attendance scoring, the bonus calculation, and the sync diff
 * that decides which edits reach Firebase.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Native-only module pulled in transitively by `constants/config`.
      'expo-constants': path.resolve(__dirname, 'test/stubs/expo-constants.ts'),
    },
  },
});
