/**
 * Brand palette.
 *
 * Every hex here was lifted straight out of the Tailwind classes in the web
 * build so the app keeps its identity. Semantic tokens (`STATUS`, `PAYMENT`)
 * are the ones screens should reach for; raw values are an escape hatch.
 */

export const BRAND = {
  primary: '#1a56db',
  primaryDark: '#1e40af',
  primaryLight: '#3b82f6',
  surfaceTint: '#eff6ff',
  border: '#dbeafe',
  borderStrong: '#bfdbfe',
  accent: '#f59e0b',
  featured: '#22c55e',
  featuredActive: '#16a34a',
} as const;

export const NEUTRAL = {
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  white: '#ffffff',
} as const;

/** Work-log status → row tint. Mirrors `rowBg` from the Excel exporters. */
export const STATUS_COLORS = {
  done: '#22c55e',
  doneNotPicked: '#f97316',
  tomorrow: '#facc15',
  settlement: '#dc2626',
  delivery: '#3b82f6',
  pending: '#ffffff',
} as const;

export const PAYMENT_COLORS = {
  Данс: '#1a56db',
  Бэлэн: '#22c55e',
  Карт: '#a855f7',
  Бусад: '#64748b',
} as const;

/** ARGB-free hex codes used by the Excel writer (`xlsx` wants no `#`). */
export const EXCEL_COLORS = {
  BLUE: '0070C0',
  WHITE: 'FFFFFF',
  GREEN: '92D050',
  ORANGE: 'FFC000',
  RED: 'FF4444',
  RED_STRONG: 'FF0000',
  YELLOW: 'FFFF00',
  PINK: 'FFD7D7',
  LGRAY: 'F2F2F2',
  PEACH: 'FCE4D6',
  GOLD: 'FFE699',
  HIGHLIGHT: 'FFFF99',
} as const;
