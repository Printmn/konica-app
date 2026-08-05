import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, IconButton, Modal, Portal } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';
import {
  DAY_LABELS_MN,
  MONTH_NAMES_MN,
  daysInMonth,
  shiftDate,
  todayString,
  weekdayOf,
} from '@/utils/date';

/**
 * Date entry without a keyboard, the sibling of `TimeField`.
 *
 * Every date on this app used to be a free text box holding `YYYY-MM-DD`. That
 * is four separators to type on a phone keypad, and a slip — `2026-8-4`, or a
 * month that does not exist — passed straight through to the printed document
 * and the exports. Here the value is chosen from a calendar and can only ever
 * be a real day.
 *
 * The value stays a `YYYY-MM-DD` string, so nothing downstream changes.
 */

interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** Extra one-tap offsets in days, shown beside «Өнөөдөр». */
  presets?: readonly { label: string; days: number }[];
  placeholder?: string;
}

const DEFAULT_PRESETS = [
  { label: 'Маргааш', days: 1 },
  { label: '+3 хоног', days: 3 },
  { label: '+7 хоног', days: 7 },
] as const;

const monthOf = (date: string): string =>
  /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : todayString().slice(0, 7);

const stepMonth = (month: string, dir: number): string => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1 + dir, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthTitle = (month: string): string => {
  const [year, mo] = month.split('-');
  const index = Number(mo) - 1;
  return `${year ?? ''} · ${MONTH_NAMES_MN[index] ?? ''}`;
};

function DateFieldBase({
  label = '',
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  placeholder = 'Огноо сонгох',
}: DateFieldProps): React.JSX.Element {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value));

  // Reopening lands on the month the field already holds rather than wherever
  // the user last browsed to.
  useEffect(() => {
    if (open) setMonth(monthOf(value));
  }, [open, value]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const blanks = weekdayOf(first);
    const total = daysInMonth(month);
    const out: (string | null)[] = Array.from({ length: blanks }, () => null);
    for (let day = 1; day <= total; day += 1) {
      out.push(`${month}-${String(day).padStart(2, '0')}`);
    }
    return out;
  }, [month]);

  const today = todayString();
  const hasValue = value.trim().length > 0;

  return (
    <View>
      {label === '' ? null : (
        <Text style={[styles.label, { color: theme.custom.mutedText }]}>{label}</Text>
      )}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Огноо'}: ${hasValue ? value : 'сонгоогүй'}`}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: theme.custom.cardBackground,
            borderColor: theme.custom.subtleBorder,
          },
          pressed && styles.pressed,
        ]}
      >
        <Icon source="calendar" size={20} color={theme.colors.primary} />
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
            {label || 'Огноо сонгох'}
          </Text>

          <View style={styles.quickRow}>
            <Pressable
              onPress={() => commit(today)}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.chipTextActive}>Өнөөдөр</Text>
            </Pressable>
            {presets.map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => commit(shiftDate(today, preset.days))}
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
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.monthRow}>
            <IconButton
              icon="chevron-left"
              size={22}
              onPress={() => setMonth((previous) => stepMonth(previous, -1))}
              accessibilityLabel="Өмнөх сар"
            />
            <Text style={[styles.monthTitle, { color: theme.colors.onSurface }]}>
              {monthTitle(month)}
            </Text>
            <IconButton
              icon="chevron-right"
              size={22}
              onPress={() => setMonth((previous) => stepMonth(previous, 1))}
              accessibilityLabel="Дараах сар"
            />
          </View>

          <View style={styles.weekRow}>
            {DAY_LABELS_MN.map((day) => (
              <Text key={day} style={[styles.weekLabel, { color: theme.custom.mutedText }]}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell, index) => {
              if (cell === null) return <View key={`blank-${index}`} style={styles.cell} />;
              const selected = cell === value;
              const isToday = cell === today;
              return (
                <Pressable
                  key={cell}
                  onPress={() => commit(cell)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.cell,
                    selected && { backgroundColor: theme.colors.primary },
                    !selected && isToday && { borderWidth: 1, borderColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      {
                        color: selected
                          ? '#ffffff'
                          : isToday
                            ? theme.colors.primary
                            : theme.colors.onSurface,
                      },
                    ]}
                  >
                    {Number(cell.slice(8))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Button mode="text" onPress={() => setOpen(false)}>
            Болих
          </Button>
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
  value: { flex: 1, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  sheet: { margin: 20, borderRadius: 20, padding: 16, gap: 8 },
  sheetTitle: { fontSize: 14, fontWeight: '800' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextActive: { fontSize: 13, fontWeight: '800', color: '#ffffff' },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 15, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  cellText: { fontSize: 15, fontWeight: '700' },
});

export const DateField = memo(DateFieldBase);
