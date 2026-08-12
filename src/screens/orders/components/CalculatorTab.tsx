import React, { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton, TextInput } from 'react-native-paper';

import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { CalcType } from '@/types';
import { nextId } from '@/utils/id';
import { calculateAreaPrice, formatCurrency, formatNumber } from '@/utils/price';

/**
 * Square-metre pricing, and the two questions asked alongside it.
 *
 * `area = width × height`, `price = round(area × base)` — identical to the web
 * build. Managers can edit the per-material base rates inline; those rates sync
 * to Firebase like any other collection.
 *
 * The day's report and the archive sit at the top. They used to be buttons over
 * the work board, where they competed with booking a job; here they are with
 * the rest of the arithmetic, which is what someone reaching for them is doing.
 */

interface CalculatorTabProps {
  calcTypes: readonly CalcType[];
  canEdit: boolean;
  onSaveTypes: (next: CalcType[]) => void;
  onRegister: (job: string, price: number) => void;
  /** Omitted for roles that may not read the takings. */
  onOpenReport?: (() => void) | undefined;
  onOpenArchive: () => void;
  /** The day being viewed, or `null` for today. */
  archiveDate: string | null;
}

function CalculatorTabBase({
  calcTypes,
  canEdit,
  onSaveTypes,
  onRegister,
  onOpenReport,
  onOpenArchive,
  archiveDate,
}: CalculatorTabProps): React.JSX.Element {
  const theme = useAppTheme();

  const [selectedId, setSelectedId] = useState<number | null>(calcTypes[0]?.id ?? null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBase, setNewBase] = useState('');

  const selected = useMemo(
    () => calcTypes.find((type) => type.id === selectedId) ?? calcTypes[0] ?? null,
    [calcTypes, selectedId],
  );

  const { area, total } = calculateAreaPrice(width, height, selected?.base ?? 0);

  const updateType = (id: number, patch: Partial<CalcType>): void =>
    onSaveTypes(calcTypes.map((type) => (type.id === id ? { ...type, ...patch } : type)));

  const removeType = (id: number): void =>
    onSaveTypes(calcTypes.filter((type) => type.id !== id));

  const addType = (): void => {
    if (!newName.trim()) return;
    onSaveTypes([
      ...calcTypes,
      { id: nextId(), name: newName.trim(), base: Number(newBase) || 0 },
    ]);
    setNewName('');
    setNewBase('');
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <View style={styles.toolRow}>
        {onOpenReport ? (
          <Button
            mode="contained-tonal"
            icon="chart-box-outline"
            compact
            onPress={onOpenReport}
            style={styles.flex}
          >
            Тайлан
          </Button>
        ) : null}
        <Button
          mode={archiveDate ? 'contained' : 'outlined'}
          icon="calendar"
          compact
          onPress={onOpenArchive}
          style={styles.flex}
        >
          {archiveDate ? archiveDate : 'Архив'}
        </Button>
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
          Материал сонгох
        </Text>
        {canEdit ? (
          <Button
            mode="text"
            compact
            onPress={() => setEditMode((value) => !value)}
            icon={editMode ? 'check' : 'pencil'}
          >
            {editMode ? 'Дуусгах' : 'Засах'}
          </Button>
        ) : null}
      </View>

      <View style={styles.typeGrid}>
        {calcTypes.map((type) => {
          const active = selected?.id === type.id;
          return editMode ? (
            <Card key={type.id} style={styles.editCard}>
              <TextInput
                mode="outlined"
                label="Нэр"
                value={type.name}
                onChangeText={(value) => updateType(type.id, { name: value })}
                dense
              />
              <View style={styles.editRow}>
                <TextInput
                  mode="outlined"
                  label="1м² үнэ"
                  value={String(type.base)}
                  onChangeText={(value) => updateType(type.id, { base: Number(value) || 0 })}
                  keyboardType="number-pad"
                  style={styles.flex}
                  dense
                />
                <IconButton
                  icon="trash-can-outline"
                  iconColor={theme.colors.error}
                  onPress={() => removeType(type.id)}
                  accessibilityLabel="Устгах"
                />
              </View>
            </Card>
          ) : (
            <Pressable
              key={type.id}
              onPress={() => setSelectedId(type.id)}
              accessibilityRole="button"
              style={[
                styles.typeChip,
                {
                  backgroundColor: active ? theme.colors.primary : theme.custom.cardBackground,
                  borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeName,
                  { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                ]}
              >
                {type.name}
              </Text>
              <Text
                style={[
                  styles.typeBase,
                  {
                    color: active
                      ? 'rgba(255,255,255,0.85)'
                      : theme.custom.mutedText,
                  },
                ]}
              >
                {formatNumber(type.base)}₮/м²
              </Text>
            </Pressable>
          );
        })}
      </View>

      {editMode ? (
        <Card style={styles.editCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Шинэ материал
          </Text>
          <TextInput
            mode="outlined"
            label="Нэр"
            value={newName}
            onChangeText={setNewName}
            dense
          />
          <TextInput
            mode="outlined"
            label="1м² үнэ"
            value={newBase}
            onChangeText={setNewBase}
            keyboardType="number-pad"
            dense
          />
          <Button mode="contained" onPress={addType} disabled={!newName.trim()}>
            Нэмэх
          </Button>
        </Card>
      ) : null}

      <View style={styles.dimensions}>
        <TextInput
          mode="outlined"
          label="Өргөн (м)"
          value={width}
          onChangeText={setWidth}
          keyboardType="decimal-pad"
          style={styles.flex}
          dense
        />
        <Text style={[styles.times, { color: theme.custom.mutedText }]}>×</Text>
        <TextInput
          mode="outlined"
          label="Өндөр (м)"
          value={height}
          onChangeText={setHeight}
          keyboardType="decimal-pad"
          style={styles.flex}
          dense
        />
      </View>

      <View style={[styles.result, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[styles.resultArea, { color: theme.colors.onPrimaryContainer }]}>
          Талбай: {area.toFixed(2)} м²
        </Text>
        <Text style={[styles.resultTotal, { color: theme.colors.onPrimaryContainer }]}>
          {formatCurrency(total)}
        </Text>
      </View>

      <Button
        mode="contained"
        icon="plus-circle"
        disabled={total <= 0 || !selected}
        onPress={() => {
          if (!selected) return;
          onRegister(`${selected.name} ${width}x${height}м`, total);
        }}
      >
        Ажил бүртгэх
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, paddingBottom: 24 },
  toolRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  typeGrid: { gap: 8 },
  typeChip: { borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  typeName: { fontSize: 13, fontWeight: '800' },
  typeBase: { fontSize: 11, fontWeight: '600' },
  editCard: { gap: 8 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dimensions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  times: { fontSize: 18, fontWeight: '700' },
  result: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  resultArea: { fontSize: 12, fontWeight: '700' },
  resultTotal: { fontSize: 26, fontWeight: '900' },
});

export const CalculatorTab = memo(CalculatorTabBase);
