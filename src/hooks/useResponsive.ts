import { useWindowDimensions } from 'react-native';

/**
 * Breakpoints.
 *
 * The web build branched on Tailwind's `md:` (768px) to switch between the
 * phone tab bar and the iPad sidebar. The same threshold is used here so the
 * two layouts stay recognisable, with an extra tier for large tablets.
 */

export const BREAKPOINTS = {
  tablet: 768,
  large: 1024,
} as const;

export interface Responsive {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLarge: boolean;
  isLandscape: boolean;
  /** Sensible column count for grid screens (home shortcuts, catalog tiles). */
  columns: number;
  /** Horizontal padding that grows with the viewport. */
  gutter: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= BREAKPOINTS.tablet;
  const isLarge = width >= BREAKPOINTS.large;
  const isLandscape = width > height;

  return {
    width,
    height,
    isPhone: !isTablet,
    isTablet,
    isLarge,
    isLandscape,
    columns: isLarge ? 4 : isTablet ? 3 : 2,
    gutter: isTablet ? 24 : 16,
  };
}
