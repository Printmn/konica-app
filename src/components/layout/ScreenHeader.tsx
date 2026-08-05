import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Gradient screen header.
 *
 * The web build repeated a `linear-gradient(135deg,#1a56db,#1e40af)` bar with a
 * back chevron and a chat button on nearly every view. That is this component;
 * `env(safe-area-inset-top)` becomes `useSafeAreaInsets().top`.
 */

interface ScreenHeaderProps {
  title: string;
  onBack?: (() => void) | undefined;
  right?: ReactNode;
  subtitle?: string | undefined;
}

function ScreenHeaderBase({
  title,
  onBack,
  right,
  subtitle,
}: ScreenHeaderProps): React.JSX.Element {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[...theme.custom.headerGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + 12 }]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Буцах"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>{right}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pressed: { opacity: 0.6 },
  spacer: { width: 4 },
  chevron: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 30,
    marginTop: -4,
    fontWeight: '600',
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

export const ScreenHeader = memo(ScreenHeaderBase);
