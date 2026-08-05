import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PIN_LENGTH } from '@/authentication/authService';

/**
 * Numeric PIN entry.
 *
 * A faithful port of the 3×4 keypad from the login screen, with one addition:
 * a wrong PIN shakes the dots via Reanimated instead of just turning them red,
 * which reads much better on a phone held at arm's length.
 */

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  hasError: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

function PinPadBase({ value, onChange, hasError }: PinPadProps): React.JSX.Element {
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!hasError) return;
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [hasError, shake]);

  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const press = (key: string): void => {
    if (!key) return;
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    onChange(value + key);
  };

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.dots, dotsStyle]}>
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[styles.dot, hasError && styles.dotError]}
            accessibilityElementsHidden
          >
            <Text style={styles.dotText}>{value[index] ? '●' : ''}</Text>
          </View>
        ))}
      </Animated.View>

      <View style={styles.grid}>
        {KEYS.map((key, index) => (
          <Pressable
            key={`${key}-${index}`}
            onPress={() => press(key)}
            disabled={!key}
            accessibilityRole="button"
            accessibilityLabel={key === '⌫' ? 'Устгах' : key}
            style={({ pressed }) => [
              styles.key,
              !key && styles.keyEmpty,
              pressed && key ? styles.keyPressed : null,
            ]}
          >
            <Text style={[styles.keyText, key === '⌫' && styles.keyTextSmall]}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: 300, alignItems: 'center', gap: 20 },
  dots: { flexDirection: 'row', gap: 12 },
  dot: {
    width: 48,
    height: 56,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotError: { borderColor: '#ef4444' },
  dotText: { fontSize: 24, color: '#ffffff', fontWeight: '900' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    width: '100%',
  },
  key: {
    width: '31.5%',
    height: 56,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: { backgroundColor: 'transparent', borderWidth: 0 },
  keyPressed: { backgroundColor: '#334155' },
  keyText: { color: '#e2e8f0', fontSize: 22, fontWeight: '700' },
  keyTextSmall: { fontSize: 20 },
});

export const PinPad = memo(PinPadBase);
