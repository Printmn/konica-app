import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Labelled figure used across the report and performance screens.
 */

interface StatTileProps {
  label: string;
  value: string;
  icon?: string;
  tint?: string | undefined;
  emphasis?: boolean;
}

function StatTileBase({
  label,
  value,
  icon,
  tint,
  emphasis = false,
}: StatTileProps): React.JSX.Element {
  const theme = useAppTheme();
  const accent = tint ?? theme.colors.primary;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: emphasis ? accent : theme.custom.cardBackground,
          borderColor: emphasis ? accent : theme.custom.subtleBorder,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: emphasis ? 'rgba(255,255,255,0.85)' : theme.custom.mutedText },
        ]}
        numberOfLines={1}
      >
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
      <Text
        style={[styles.value, { color: emphasis ? '#ffffff' : accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  value: { fontSize: 17, fontWeight: '900' },
});

export const StatTile = memo(StatTileBase);
