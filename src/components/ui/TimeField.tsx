import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Button, Icon, Modal, Portal } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';
import { nowTimeString } from '@/utils/date';

/**
 * Time entry without a keyboard.
 *
 * Typing `14:30` on a phone keypad means switching layouts to find the colon,
 * so every time in this app is chosen rather than typed. Two wheels — hours on
 * the left, minutes on the right — and whatever sits between the two guide
 * lines is the selection.
 *
 * The wheels snap. A free-scrolling list leaves a number half off the line and
 * makes you guess which one is chosen; snapping means the wheel always comes to
 * rest on a value, and the value is the one under the lines.
 *
 * The value stays a `HH:mm` string so nothing downstream — `timeToMinutes`,
 * the Excel exporters, the stored records — has to change.
 */

interface TimeFieldProps {
  /** Omitted where the surrounding form already numbers and labels the step. */
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** Offered as one-tap chips above the wheels. */
  presets?: readonly string[];
  placeholder?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
/** Five-minute granularity: the shop has never needed to record 14:37. */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const ROW_HEIGHT = 48;
/** Rows visible at once. Odd, so one of them is the middle. */
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
/** Blank space above and below, so the first and last values can reach centre. */
const PADDING = ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

const split = (value: string): { hour: string; minute: string } => {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!match) return { hour: '', minute: '' };
  return {
    hour: (match[1] ?? '').padStart(2, '0'),
    minute: (match[2] ?? '').padStart(2, '0'),
  };
};

/** Snaps an arbitrary minute onto the nearest five, so 14:37 opens on 14:35. */
const nearestStep = (minute: string): string => {
  const n = Number(minute);
  if (!Number.isFinite(n)) return '00';
  return String(Math.min(55, Math.round(n / 5) * 5)).padStart(2, '0');
};

interface WheelProps {
  items: readonly string[];
  selected: string;
  onSelect: (next: string) => void;
  label: string;
}

/** One snapping column. */
function Wheel({ items, selected, onSelect, label }: WheelProps): React.JSX.Element {
  const theme = useAppTheme();
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, items.indexOf(selected));

  // Follows the value when it changes from outside — a preset chip, or the
  // sheet opening — without fighting a scroll the finger is still driving.
  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.scrollTo({ y: index * ROW_HEIGHT, animated: false });
    }, 30);
    return () => clearTimeout(timer);
  }, [index]);

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = items[Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)];
      if (next !== undefined && next !== selected) onSelect(next);
    },
    [items, selected, onSelect],
  );

  return (
    <View style={styles.wheelWrap}>
      <Text style={[styles.wheelLabel, { color: theme.custom.mutedText }]}>{label}</Text>
      <ScrollView
        ref={ref}
        style={styles.wheel}
        contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        // A slow drag that stops without momentum never fires the handler
        // above, which would leave the wheel showing one value and holding
        // another.
        onScrollEndDrag={settle}
      >
        {items.map((item) => {
          const active = item === selected;
          return (
            <Pressable
              key={item}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={styles.row}
            >
              <Text
                style={[
                  styles.rowText,
                  {
                    color: active ? theme.colors.primary : theme.colors.onSurfaceVariant,
                    opacity: active ? 1 : 0.45,
                  },
                  active && styles.rowTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TimeFieldBase({
  label = '',
  value,
  onChange,
  presets = [],
  placeholder = '--:--',
}: TimeFieldProps): React.JSX.Element {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');

  // Opening starts from whatever is already in the field, falling back to the
  // current time so the first thing under the lines is always plausible.
  useEffect(() => {
    if (!open) return;
    const current = split(value);
    setHour(current.hour || nowTimeString().slice(0, 2));
    setMinute(nearestStep(current.minute || nowTimeString().slice(3, 5)));
  }, [open, value]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  const hasValue = value.trim().length > 0;

  return (
    <View>
      {label === '' ? null : (
        <Text style={[styles.label, { color: theme.custom.mutedText }]}>{label}</Text>
      )}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Цаг'}: ${hasValue ? value : 'сонгоогүй'}`}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: theme.custom.cardBackground,
            borderColor: theme.custom.subtleBorder,
          },
          pressed && styles.pressed,
        ]}
      >
        <Icon source="clock-outline" size={20} color={theme.colors.primary} />
        <Text
          style={[
            styles.value,
            { color: hasValue ? theme.colors.onSurface : theme.custom.mutedText },
          ]}
        >
          {hasValue ? value : placeholder}
        </Text>
        <Icon source="chevron-down" size={20} color={theme.custom.mutedText} />
      </Pressable>

      <Portal>
        <Modal
          visible={open}
          onDismiss={() => setOpen(false)}
          contentContainerStyle={[
            styles.sheet,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme.colors.onSurface }]}>
              {label || 'Цаг сонгох'}
            </Text>
            <Text style={[styles.preview, { color: theme.colors.primary }]}>
              {hour || '--'}:{minute || '--'}
            </Text>
          </View>

          <View style={styles.quickRow}>
            <Pressable
              onPress={() => commit(nowTimeString())}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.chipTextActive}>Одоо</Text>
            </Pressable>

            {presets.map((preset) => (
              <Pressable
                key={preset}
                onPress={() => commit(preset)}
                accessibilityRole="button"
                style={[
                  styles.chip,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderColor: theme.custom.subtleBorder,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.colors.onSurface }]}>
                  {preset}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.wheels}>
            {/* The band the selection sits in. Behind the wheels and not
                touchable, so it cannot swallow a scroll. */}
            <View pointerEvents="none" style={styles.selectionBand}>
              <View
                style={[
                  styles.selectionInner,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              />
            </View>

            <Wheel items={HOURS} selected={hour} onSelect={setHour} label="Цаг" />
            <Text style={[styles.colon, { color: theme.colors.onSurface }]}>:</Text>
            <Wheel items={MINUTES} selected={minute} onSelect={setMinute} label="Минут" />
          </View>

          <View style={styles.actions}>
            <Button mode="text" onPress={() => setOpen(false)} style={styles.flex}>
              Болих
            </Button>
            <Button
              mode="contained"
              onPress={() => commit(`${hour}:${minute}`)}
              disabled={hour === '' || minute === ''}
              style={styles.flex}
            >
              Сонгох
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pressed: { opacity: 0.7 },
  value: { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  sheet: { margin: 18, borderRadius: 20, padding: 16, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 14, fontWeight: '800' },
  preview: { fontSize: 28, fontWeight: '900', letterSpacing: 1 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextActive: { fontSize: 13, fontWeight: '800', color: '#ffffff' },

  wheels: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PADDING + 18,
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  selectionInner: { height: ROW_HEIGHT, borderRadius: 12 },
  colon: { fontSize: 26, fontWeight: '900', paddingBottom: WHEEL_HEIGHT / 2 - 16 },

  wheelWrap: { width: 96 },
  wheelLabel: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  wheel: { height: WHEEL_HEIGHT },
  wheelContent: { paddingVertical: PADDING },
  row: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 22, fontWeight: '700' },
  rowTextActive: { fontSize: 26, fontWeight: '900' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
});

export const TimeField = memo(TimeFieldBase);
