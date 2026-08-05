import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { PIN_LENGTH } from '@/authentication/authService';
import { PinPad } from '@/components/ui/PinPad';
import { useData } from '@/features/data/DataContext';
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
 * Whether the Staff option appears on the login screen.
 *
 * The shop runs on two devices, so the third door is not needed at the moment.
 * Everything behind it is left intact rather than deleted: the role, its
 * permissions, the employee PINs and the attendance identity they carry. A
 * device already signed in as staff keeps working, and turning this back on is
 * the whole change.
 *
 * It matters because that role is what ties an attendance record to the person
 * who authenticated. Recording attendance from the iPad instead means picking
 * a name from a list, which nobody has to prove.
 */
const SHOW_WORKER_LOGIN = false;

export function LoginScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { employees } = useData();

  const [step, setStep] = useState<Step>('choose');
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
        const success = await login(step, pin, employees);
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
  }, [pin, step, employees, login]);

  // The reset timer outlives the effect that scheduled it, so it is cleared on
  // unmount rather than in that effect's cleanup.
  useEffect(() => () => clearTimeout(errorTimer.current), []);

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
                  <Text style={styles.optionTitleDim}>Staff</Text>
                  <Text style={styles.optionHint}>PIN код шаардана</Text>
                </View>
              </Pressable>
            ) : null}

          </View>
        ) : (
          <View style={styles.pinArea}>
            <PinPad value={pin} onChange={setPin} hasError={hasError} />
            {hasError ? (
              <Text style={styles.error}>Буруу PIN. Дахин оруулна уу.</Text>
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
  error: { color: '#ef4444', fontSize: 13 },
  back: { color: '#64748b', fontSize: 13, paddingVertical: 8 },
});
