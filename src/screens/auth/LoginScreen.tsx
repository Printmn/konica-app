import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/authentication/AuthContext';
import { PIN_LENGTH } from '@/authentication/authService';
import { PinPad } from '@/components/ui/PinPad';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import { useData } from '@/features/data/DataContext';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import type { Role } from '@/types';

/**
 * PIN login.
 *
 * Same three entry points as the web build — iPad kiosk, staff, and the manager
 * (reached by long-pressing the logo, replacing the `#manager` URL hash that no
 * longer exists on a phone).
 *
 * Verification runs against SecureStore rather than a constant compiled into
 * the bundle, and a wrong PIN clears itself after a second, exactly as before.
 */

type Step = 'choose' | Role;

/**
 * Whether the Staff door appears on the login screen.
 *
 * It was off while the shop ran on two devices and nobody clocked in through
 * the app. It is back on because the staff screen — attendance, habits, the
 * day's spending, the score — needs to know *who* is looking, and this role is
 * the only thing that establishes that. Recording attendance from the shared
 * iPad instead means picking a name off a list, which proves nothing.
 */
const SHOW_WORKER_LOGIN = true;

export function LoginScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { login, loginError } = useAuth();
  const { employees } = useData();

  const [step, setStep] = useState<Step>('choose');
  /**
   * Who is signing in, typed by the person themselves.
   *
   * Attendance, the day's spending and the monthly score are all filed under a
   * name, and the shop has no screen for editing the roster — so the name has
   * to be stated here or it is never stated at all. Remembered between
   * sessions, because it is almost always the same two or three people.
   */
  const [workerName, setWorkerName] = useState('');
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  /** Guards a login already in flight without re-running the submit effect. */
  const checking = useRef(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback(() => {
    setStep('choose');
    setPin('');
    setHasError(false);
  }, []);

  /**
   * Auto-submit as soon as the fourth digit lands — no confirm button, matching
   * the original keypad behaviour.
   *
   * The in-flight guard is a ref, not state, and that is the whole point.
   * As a state value it sat in this effect's dependency list, so setting it
   * re-ran the effect, whose cleanup cancelled the attempt already in progress.
   * The cancelled attempt then skipped clearing the flag, leaving it stuck on
   * forever: one wrong PIN and every later attempt returned at the first line.
   * It looked like the keypad had died, and only a reload cleared it. A ref
   * does not re-trigger the effect, and `finally` releases the guard whether
   * the attempt succeeded, failed, or was abandoned.
   */
  useEffect(() => {
    if (step === 'choose' || pin.length !== PIN_LENGTH || checking.current) return;

    let cancelled = false;
    checking.current = true;

    void (async () => {
      try {
        const success = await login(step, pin, employees, workerName);
        if (cancelled) return;

        if (success) {
          setPin('');
          setHasError(false);
          return;
        }

        setHasError(true);
        clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => {
          setPin('');
          setHasError(false);
        }, 1000);
      } finally {
        checking.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pin, step, employees, login, workerName]);

  // The reset timer outlives the effect that scheduled it, so it is cleared on
  // unmount rather than in that effect's cleanup.
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  // Restore the last name used, so the usual person types four digits and
  // nothing else.
  useEffect(() => {
    void (async () => {
      const stored = await readJson<string | null>(STORAGE_KEYS.lastWorkerName, null);
      if (typeof stored === 'string') setWorkerName(stored);
    })();
  }, []);

  useEffect(() => {
    if (step !== 'worker') return;
    const name = workerName.trim();
    if (name.length > 0) void writeJson(STORAGE_KEYS.lastWorkerName, name);
  }, [step, workerName]);

  const stepTitle =
    step === 'ipad' ? 'iPad горим' : step === 'worker' ? 'Ажилтан' : 'Менежер';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Long-pressing the logo opens the manager keypad — the phone
            equivalent of the old `#manager` hash route. */}
        <Pressable
          onLongPress={() => setStep('manager')}
          delayLongPress={700}
          style={styles.brand}
          accessibilityLabel="Printmn Konica"
        >
          <View style={styles.logo}>
            <Icon source="printer" size={28} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.brandName}>Printmn Konica</Text>
            <Text style={styles.brandTag}>Ажлын удирдлага</Text>
          </View>
        </Pressable>

        <Text style={styles.prompt}>{step === 'choose' ? 'Нэвтрэх' : stepTitle}</Text>

        {step === 'choose' ? (
          <View style={styles.options}>
            <Pressable
              onPress={() => setStep('ipad')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.option,
                styles.optionPrimary,
                pressed && styles.optionPressed,
              ]}
            >
              <View style={styles.optionIcon}>
                <Icon source="tablet" size={22} color="#ffffff" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>iPad горим</Text>
                <Text style={styles.optionHintLight}>PIN код шаардана</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => setStep('manager')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.option,
                styles.optionSecondary,
                pressed && styles.optionPressed,
              ]}
            >
              <View style={styles.optionIconDark}>
                <Icon source="shield-account" size={22} color="#94a3b8" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitleDim}>Менежер</Text>
                <Text style={styles.optionHint}>PIN код шаардана</Text>
              </View>
            </Pressable>

            {SHOW_WORKER_LOGIN ? (
              <Pressable
                onPress={() => setStep('worker')}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.option,
                  styles.optionSecondary,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={styles.optionIconDark}>
                  <Icon source="account-box" size={22} color="#94a3b8" />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitleDim}>Ажилтан</Text>
                  <Text style={styles.optionHint}>Цаг бүртгэл, дадал, оноо</Text>
                </View>
              </Pressable>
            ) : null}

          </View>
        ) : (
          <View style={styles.pinArea}>
            {step === 'worker' ? (
              <View style={styles.nameBox}>
                <Text style={styles.nameLabel}>ТАНЫ НЭР</Text>
                <TextInput
                  value={workerName}
                  onChangeText={setWorkerName}
                  placeholder="Нэрээ бичнэ үү"
                  placeholderTextColor="#475569"
                  style={styles.nameInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  accessibilityLabel="Ажилтны нэр"
                />
                {/* Names already on the roster, as one-tap shortcuts. Typing a
                    name that is not on it is still allowed — the roster has no
                    editing screen, and a new hire must be able to clock in. */}
                {employees.length > 0 ? (
                  <View style={styles.nameChips}>
                    {employees.slice(0, 6).map((employee) => (
                      <Pressable
                        key={employee.id}
                        onPress={() => setWorkerName(employee.name)}
                        accessibilityRole="button"
                        style={[
                          styles.nameChip,
                          workerName.trim() === employee.name && styles.nameChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.nameChipText,
                            workerName.trim() === employee.name && styles.nameChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {employee.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <PinPad value={pin} onChange={setPin} hasError={hasError} />
            {hasError ? (
              // The PIN may have been right and the name missing; saying
              // «Буруу PIN» to that sends somebody off to try three more.
              <Text style={styles.error}>{loginError || 'Буруу PIN. Дахин оруулна уу.'}</Text>
            ) : null}
            <Pressable onPress={reset} hitSlop={12} accessibilityRole="button">
              <Text style={styles.back}>← Буцах</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logo: {
    width: 52,
    height: 52,
    backgroundColor: '#1a56db',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { color: '#ffffff', fontWeight: '900', fontSize: 20 },
  brandTag: { color: '#94a3b8', fontSize: 12 },
  prompt: { color: '#64748b', fontSize: 13, marginBottom: 32 },
  options: { width: '100%', maxWidth: 340, gap: 14 },
  option: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  optionPrimary: {
    backgroundColor: '#1a56db',
    shadowColor: '#1a56db',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  optionSecondary: { backgroundColor: '#0f172a', borderWidth: 1.5, borderColor: '#334155' },
  optionPressed: { opacity: 0.75 },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconDark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  optionTitleDim: { color: '#e2e8f0', fontWeight: '800', fontSize: 16 },
  optionHintLight: { color: '#93c5fd', fontSize: 12 },
  optionHint: { color: '#64748b', fontSize: 12 },
  pinArea: { width: '100%', alignItems: 'center', gap: 16 },
  nameBox: { width: '100%', maxWidth: 340, gap: 8 },
  nameLabel: { color: '#64748b', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  nameInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  nameChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nameChipActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  nameChipText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  nameChipTextActive: { color: '#ffffff' },
  error: { color: '#ef4444', fontSize: 13 },
  back: { color: '#64748b', fontSize: 13, paddingVertical: 8 },
});
