import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Modal, Portal, TextInput } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';
import { formatCurrency } from '@/utils/price';

/**
 * Square-metre calculator.
 *
 * Banner and sticker jobs are quoted per m², not per piece. The shop measures
 * in centimetres, so the conversion happens here and only the resulting unit
 * price leaves the modal — the form itself stays unaware that m² exist.
 */

interface SquareMeterModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Receives the computed price for one item, as a plain digit string. */
  onApply: (unitPrice: string) => void;
  /** Pre-fills the rate when the form already has one. */
  initialRate?: string;
}

const toNumber = (value: string): number => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function SquareMeterModalBase({
  visible,
  onDismiss,
  onApply,
  initialRate = '',
}: SquareMeterModalProps): React.JSX.Element {
  const theme = useAppTheme();
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [rate, setRate] = useState(initialRate);

  const { area, total } = useMemo(() => {
    const squareMetres = (toNumber(width) / 100) * (toNumber(height) / 100);
    return {
      area: squareMetres,
      total: Math.round(squareMetres * toNumber(rate)),
    };
  }, [width, height, rate]);

  const reset = (): void => {
    setWidth('');
    setHeight('');
  };

  const apply = (): void => {
    onApply(String(total));
    reset();
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.custom.cardBackground },
        ]}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          📐 Талбайгаар тооцоолох
        </Text>
        <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
          Хэмжээг сантиметрээр оруулна уу.
        </Text>

        <View style={styles.row}>
          <TextInput
            mode="outlined"
            label="Өргөн (см)"
            value={width}
            onChangeText={setWidth}
            keyboardType="decimal-pad"
            style={styles.flex}
            dense
          />
          <TextInput
            mode="outlined"
            label="Өндөр (см)"
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            style={styles.flex}
            dense
          />
        </View>

        <TextInput
          mode="outlined"
          label="1 м² үнэ (₮)"
          value={rate}
          onChangeText={setRate}
          keyboardType="number-pad"
          dense
        />

        <View style={[styles.result, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text style={[styles.resultLabel, { color: theme.colors.onPrimaryContainer }]}>
            {area > 0 ? `${area.toFixed(3)} м²` : 'Талбай —'}
          </Text>
          <Text style={[styles.resultValue, { color: theme.colors.onPrimaryContainer }]}>
            {formatCurrency(total)}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={styles.flex}>
            Болих
          </Button>
          <Button mode="contained" onPress={apply} disabled={total <= 0} style={styles.flex}>
            Нэгж үнэд оруулах
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 11, marginTop: -6 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 2,
  },
  resultLabel: { fontSize: 13, fontWeight: '700' },
  resultValue: { fontSize: 18, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});

export const SquareMeterModal = memo(SquareMeterModalBase);
