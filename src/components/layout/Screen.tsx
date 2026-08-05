import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '@/hooks/useResponsive';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Screen shell.
 *
 * Applies the themed background, the bottom safe-area inset and a gutter that
 * widens on tablets, so individual screens never hard-code either.
 */

interface ScreenProps {
  children: ReactNode;
  /** Set false for screens that manage their own horizontal padding (lists). */
  padded?: boolean;
  style?: ViewStyle | undefined;
}

export function Screen({ children, padded = false, style }: ScreenProps): React.JSX.Element {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.custom.screenBackground, paddingBottom: insets.bottom },
        padded && { paddingHorizontal: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
