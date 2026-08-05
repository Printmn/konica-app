import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, Modal, Portal } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';
import { nowTimeString } from '@/utils/date';

/**
 * Time entry without a keyboard.
 *
 * Typing `14:30` on a phone keypad means switching layouts to find the colon,
 * and every screen that asked for a time was a plain text box — so a mistyped
 * `1430` silently became an invalid arrival or deadline. This replaces that
 * with a tap target: quick presets first (which is what people pick almost
 * every time), then hour and minute columns for anything else.
 *
 * The value stays a `HH:mm` string so nothing downstream — `timeToMinutes`,
 * the Excel exporters, the stored records — has to change.
 */

interface TimeFieldProps {
  /** Omitted where the surrounding form already numbers and labels the step. */
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** Offered as one-tap chips above the columns. */
  presets?: readonly string[];
  placeholder?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
/** Five-minute granularity: the shop has never needed to record 14:37. */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const ROW_HEIGHT = 44;

const split = (value: string): { hour: string; minute: string } => {
  const [h = '', m = ''] = value.split(':');
  const hour = HOURS.includes(h.padStart(2, '0')) ? h.padStart(2, '0') : '';
  const minute = /^\d{1,2}$/.test(m) ? m.padStart(2, '0') : '';
  return { hour, minute };
};

/** Rounds an arbitrary minute onto the nearest five, so 14:37 shows as 14:35. */
const nearestStep = (minute: string): string => {
  const n = Number(minute);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.min(55, Math.round(n / 5) * 5);
  return String(rounded).padStart(2, '0');
};

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
  const hourList = useRef<ScrollView>(null);
  const minuteList = useRef<ScrollView>(null);

  const current = useMemo(() => split(value), [value]);

  // Opening the sheet starts from whatever is already in the field, and scrolls
  // both columns so the selection is visible rather than buried.
  useEffect(() => {
    if (!open) return;
    const startHour = current.hour || nowTimeString().slice(0, 2);
    const startMinute = nearestStep(current.minute || nowTimeString().slice(3, 5));
    setHour(startHour);
    setMinute(startMinute);

    const timer = setTimeout(() => {
      hourList.current?.scrollTo({
        y: Math.max(0, (HOURS.indexOf(startHour) - 2) * ROW_HEIGHT),
        animated: false,
      });
      minuteList.current?.scrollTo({
        y: Math.max(0, (MINUTES.indexOf(startMinute) - 2) * ROW_HEIGHT),
        animated: false,
      });
    }, 40);
    return () => clearTimeout(timer);
  }, [open, current.hour, current.minute]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  const confirm = useCallback(() => {
    if (hour === '' || minute === '') return;
    commit(`${hour}:${minute}`);
  }, [hour, minute, commit]);

  const column = (
    items: readonly string[],
    selected: string,
    onSelect: (next: string) => void,
    ref: React.RefObject<ScrollView | null>,
  ): React.JSX.Element => (
    <ScrollView
      ref={ref}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.columnContent}
    >
      {items.map((item) => {
        const active = item === selected;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.cell,
              {
                backgroundColor: active ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.cellText,
                { color: active ? '#ffffff' : theme.colors.onSurface },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
          <Text style={[styles.sheetTitle, { color: theme.colors.onSurface }]}>
            {label || 'Цаг сонгох'}
          </Text>

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

          <Text style={[styles.preview, { color: theme.colors.primary }]}>
            {hour || '--'}:{minute || '--'}
          </Text>

          <View style={styles.columns}>
            <View style={styles.columnWrap}>
              <Text style={[styles.columnLabel, { color: theme.custom.mutedText }]}>Цаг</Text>
              {column(HOURS, hour, setHour, hourList)}
            </View>
            <View style={styles.columnWrap}>
              <Text style={[styles.columnLabel, { color: theme.custom.mutedText }]}>Минут</Text>
              {column(MINUTES, minute, setMinute, minuteList)}
            </View>
          </View>

          <View style={styles.actions}>
            <Button mode="text" onPress={() => setOpen(false)} style={styles.flex}>
              Болих
            </Button>
            <Button
              mode="contained"
              onPress={confirm}
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

  sheet: { margin: 20, borderRadius: 20, padding: 16, gap: 10 },
  sheetTitle: { fontSize: 14, fontWeight: '800' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextActive: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  preview: { fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  columns: { flexDirection: 'row', gap: 12 },
  columnWrap: { flex: 1 },
  columnLabel: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  column: { height: ROW_HEIGHT * 4 },
  columnContent: { paddingVertical: 2 },
  cell: {
    height: ROW_HEIGHT,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 18, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  flex: { flex: 1 },
});

export const TimeField = memo(TimeFieldBase);
