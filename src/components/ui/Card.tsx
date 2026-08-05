import React, { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Surface container.
 *
 * Replaces the `bg-white rounded-2xl border shadow-sm` block that appeared
 * dozens of times in the web build. Elevation is real on Android and a shadow
 * on iOS, and the border colour follows the theme so dark mode works.
 */

interface CardProps {
  children: ReactNode;
  onPress?: (() => void) | undefined;
  /** Left accent stripe — used to show work-log status at a glance. */
  accentColor?: string | undefined;
  padded?: boolean;
  style?: ViewStyle | undefined;
}

function CardBase({
  children,
  onPress,
  accentColor,
  padded = true,
  style,
}: CardProps): React.JSX.Element {
  const theme = useAppTheme();

  const surface: ViewStyle = {
    backgroundColor: theme.custom.cardBackground,
    borderColor: accentColor ?? theme.custom.subtleBorder,
    borderWidth: accentColor ? 2 : StyleSheet.hairlineWidth * 2,
    borderRadius: theme.radius.lg,
  };

  const content = (
    <View style={[styles.card, surface, padded && styles.padded, style]}>{children}</View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  padded: { padding: 12 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.995 }] },
});

export const Card = memo(CardBase);
