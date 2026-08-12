import {
  MD3DarkTheme,
  MD3LightTheme,
  configureFonts,
  type MD3Theme,
} from 'react-native-paper';

import { BRAND, NEUTRAL } from './colors';

/**
 * Material Design 3 themes.
 *
 * `spacing`, `radius` and `typography` are attached to the theme object so a
 * screen only ever needs `useAppTheme()` — no second import for layout tokens.
 */

const fontConfig = configureFonts({
  config: {
    // Slightly tighter than stock MD3; the original UI was dense.
    bodySmall: { letterSpacing: 0 },
    bodyMedium: { letterSpacing: 0 },
    labelSmall: { letterSpacing: 0.1 },
  },
});

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const TYPE_SCALE = {
  micro: 10,
  tiny: 11,
  small: 12,
  body: 14,
  title: 16,
  heading: 18,
  display: 22,
} as const;

export interface AppTheme extends MD3Theme {
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  typeScale: typeof TYPE_SCALE;
  custom: {
    headerGradient: readonly [string, string];
    screenBackground: string;
    cardBackground: string;
    subtleBorder: string;
    mutedText: string;
    accent: string;
    /**
     * The fill behind a chosen item in a top-of-screen menu.
     *
     * Blue was doing two jobs at once — it is the brand colour on headers and
     * buttons, so a chosen tab read as decoration rather than as a state. Green
     * is used for nothing else, which is what makes the current choice
     * findable at a glance across a busy counter.
     */
    selected: string;
    onSelected: string;
  };
}

export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  fonts: fontConfig,
  roundness: RADIUS.md,
  colors: {
    ...MD3LightTheme.colors,
    primary: BRAND.primary,
    onPrimary: NEUTRAL.white,
    primaryContainer: BRAND.border,
    onPrimaryContainer: BRAND.primaryDark,
    secondary: BRAND.primaryLight,
    // Paper paints the chosen segment of `SegmentedButtons` with
    // `secondaryContainer`, so setting it here turns every top menu in the app
    // green at once rather than screen by screen.
    secondaryContainer: BRAND.featuredActive,
    onSecondaryContainer: NEUTRAL.white,
    background: BRAND.surfaceTint,
    onBackground: '#111827',
    surface: NEUTRAL.white,
    onSurface: '#111827',
    surfaceVariant: '#f3f4f6',
    onSurfaceVariant: '#6b7280',
    outline: '#d1d5db',
    outlineVariant: BRAND.border,
    error: '#dc2626',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: NEUTRAL.white,
      level2: '#fbfdff',
    },
  },
  spacing: SPACING,
  radius: RADIUS,
  typeScale: TYPE_SCALE,
  custom: {
    headerGradient: [BRAND.primary, BRAND.primaryDark],
    screenBackground: BRAND.surfaceTint,
    cardBackground: NEUTRAL.white,
    subtleBorder: BRAND.border,
    mutedText: '#6b7280',
    accent: BRAND.accent,
    selected: BRAND.featuredActive,
    onSelected: NEUTRAL.white,
  },
};

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  fonts: fontConfig,
  roundness: RADIUS.md,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7ea6ff',
    onPrimary: '#062046',
    primaryContainer: '#1e3a8a',
    onPrimaryContainer: '#dbeafe',
    secondary: '#93c5fd',
    secondaryContainer: BRAND.featured,
    onSecondaryContainer: '#052e16',
    background: '#0b1220',
    onBackground: NEUTRAL.slate200,
    surface: '#111a2b',
    onSurface: NEUTRAL.slate200,
    surfaceVariant: '#1b2436',
    onSurfaceVariant: NEUTRAL.slate400,
    outline: '#33405a',
    outlineVariant: '#243049',
    error: '#f87171',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level1: '#111a2b',
      level2: '#162033',
    },
  },
  spacing: SPACING,
  radius: RADIUS,
  typeScale: TYPE_SCALE,
  custom: {
    headerGradient: ['#1e3a8a', '#0f172a'],
    screenBackground: '#0b1220',
    cardBackground: '#111a2b',
    subtleBorder: '#243049',
    mutedText: NEUTRAL.slate400,
    accent: BRAND.accent,
    selected: BRAND.featured,
    onSelected: '#052e16',
  },
};
