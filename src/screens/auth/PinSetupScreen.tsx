import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/authentication/AuthContext';
import { PIN_LENGTH, isValidPin } from '@/authentication/authService';
import { PinPad } from '@/components/ui/PinPad';

/**
 * First-run PIN setup.
 *
 * Nothing ships with a factory PIN any more, so a fresh install lands here and
 * the manager chooses all three codes. Each one is entered twice: a typo in a
 * code that is only ever typed on a keypad would otherwise lock the shop out of
 * its own app with no way back short of reinstalling.
 */

type Slot = 'manager' | 'ipad' | 'worker';

const SLOTS: { key: Slot; title: string; hint: string; icon: string }[] = [
  {
    key: 'manager',
    title: 'Менежерийн PIN',
    hint: 'Бүх эрхтэй. Тайлан, тохиргоо, ажилтны бүртгэл.',
    icon: 'shield-account',
  },
  {
    key: 'ipad',
    title: 'iPad горимын PIN',
    hint: 'Лангууны төхөөрөмж. Захиалга бүртгэнэ.',
    icon: 'tablet',
  },
  {
    key: 'worker',
    title: 'Ажилтны нийтлэг PIN',
    hint: 'Ажилтан бүрт өөрийн PIN олгох хүртэл ашиглана.',
    icon: 'account-group',
  },
];

export function PinSetupScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { setupPins } = useAuth();

  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [entry, setEntry] = useState('');
  const [firstEntry, setFirstEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<Slot, string>>({
    manager: '',
    ipad: '',
    worker: '',
  });
  const [saving, setSaving] = useState(false);

  const slot = SLOTS[index];

  const finish = useCallback(
    async (complete: Record<Slot, string>) => {
      setSaving(true);
      const saved = await setupPins(complete);
      setSaving(false);
      if (!saved) setError('Хадгалахад алдаа гарлаа. Дахин оролдоно уу.');
    },
    [setupPins],
  );

  const handleChange = useCallback(
    (value: string) => {
      setEntry(value);
      setError(null);
      if (value.length !== PIN_LENGTH || slot === undefined) return;

      if (!confirming) {
        if (!isValidPin(value)) {
          setError('PIN 4 оронтой тоо байх ёстой.');
          setEntry('');
          return;
        }
        setFirstEntry(value);
        setConfirming(true);
        setEntry('');
        return;
      }

      if (value !== firstEntry) {
        setError('Тохирохгүй байна. Эхнээс нь дахин оруулна уу.');
        setConfirming(false);
        setFirstEntry('');
        setEntry('');
        return;
      }

      const next = { ...pins, [slot.key]: value };
      setPins(next);
      setConfirming(false);
      setFirstEntry('');
      setEntry('');

      if (index < SLOTS.length - 1) setIndex(index + 1);
      else void finish(next);
    },
    [confirming, firstEntry, index, pins, slot, finish],
  );

  const back = useCallback(() => {
    setError(null);
    setEntry('');
    if (confirming) {
      setConfirming(false);
      setFirstEntry('');
      return;
    }
    if (index > 0) setIndex(index - 1);
  }, [confirming, index]);

  const progress = useMemo(
    () => SLOTS.map((_, i) => (i < index ? 'done' : i === index ? 'active' : 'todo')),
    [index],
  );

  if (slot === undefined) return <View style={styles.root} />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Icon source="shield-key" size={28} color="#ffffff" />
        </View>

        <Text style={styles.title}>Анхны тохиргоо</Text>
        <Text style={styles.subtitle}>
          Аппыг ашиглахын өмнө 3 PIN код тохируулна. Эдгээрийг зөвхөн энэ
          төхөөрөмжийн хамгаалалттай санд хадгална.
        </Text>

        <View style={styles.progress}>
          {progress.map((status, i) => (
            <View
              key={SLOTS[i]?.key}
              style={[
                styles.progressDot,
                status === 'done' && styles.progressDone,
                status === 'active' && styles.progressActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.slotHeader}>
          <Icon source={slot.icon} size={20} color="#93c5fd" />
          <Text style={styles.slotTitle}>{slot.title}</Text>
        </View>
        <Text style={styles.slotHint}>{slot.hint}</Text>

        <Text style={styles.step}>
          {confirming ? 'Баталгаажуулах — дахин оруулна уу' : 'Шинэ PIN оруулна уу'}
        </Text>

        <PinPad value={entry} onChange={handleChange} hasError={error !== null} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saving ? <Text style={styles.saving}>Хадгалж байна...</Text> : null}

        {index > 0 || confirming ? (
          <Pressable onPress={back} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>← Буцах</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footer}>
          PIN мартвал аппыг дахин суулгаж, өгөгдлөө нөөцөөс сэргээх шаардлагатай
          болно. Найдвартай газар тэмдэглэж авна уу.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, gap: 8 },
  logo: {
    width: 52,
    height: 52,
    backgroundColor: '#1a56db',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { color: '#ffffff', fontWeight: '900', fontSize: 20 },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  progress: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  progressDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: '#1e293b' },
  progressActive: { backgroundColor: '#1a56db' },
  progressDone: { backgroundColor: '#22c55e' },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 15 },
  slotHint: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 4,
  },
  step: { color: '#93c5fd', fontSize: 12, marginBottom: 12 },
  error: { color: '#ef4444', fontSize: 12, textAlign: 'center' },
  saving: { color: '#94a3b8', fontSize: 12 },
  back: { color: '#64748b', fontSize: 13, paddingVertical: 8 },
  footer: {
    color: '#475569',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
    maxWidth: 300,
    marginTop: 12,
  },
});
