import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, PermissionDenied } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { useData } from '@/features/data/DataContext';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { Employee, HabitTask } from '@/types';
import { nextId } from '@/utils/id';
import { DAY_LABELS_MN } from '@/utils/date';

/**
 * Employee roster and habit configuration.
 *
 * Rest-day handling is the part that matters: `restDays` holds JS weekday
 * indices, and the monthly bonus divides by the number of *working* days, so a
 * wrong entry here quietly changes someone's pay. The two preset buttons
 * (Мя+Бя, Мя+Ня) are the shop's actual rotas, carried over from the web build.
 */

/** Purple marks "time off" throughout this screen, distinct from the app blue. */
const REST_ACCENT = '#7c3aed';
const REST_ACCENT_SOFT = '#f3e8ff';

/**
 * Mongolian week numbering runs Monday = 1 … Sunday = 7, while JS weekday
 * indices run Sunday = 0. The hint spells out the local numbers so a manager
 * can check the rota against a paper calendar without translating.
 */
const mnDayNumber = (weekday: number): number => (weekday === 0 ? 7 : weekday);

const REST_PRESETS: { label: string; hint: string; days: number[] }[] = [
  { label: 'Мя + Бя', hint: '2, 6-р өдөр', days: [2, 6] },
  { label: 'Мя + Ня', hint: '2, 7-р өдөр', days: [0, 2] },
];

const sameDays = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** `[0, 2]` → `Мя + Ня`, matching the preset labels people already read. */
const restLabel = (restDays: readonly number[] | undefined): string => {
  const days = restDays ?? [];
  if (days.length === 0) return 'Амралтгүй';
  const preset = REST_PRESETS.find((candidate) => sameDays(days, candidate.days));
  if (preset) return preset.label;
  return [...days]
    .sort((a, b) => mnDayNumber(a) - mnDayNumber(b))
    .map((day) => DAY_LABELS_MN[day] ?? '?')
    .join(' + ');
};


export function AdminScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const navigation = useNavigation();
  const { can } = useAuth();
  const { show } = useToast();
  const { gutter } = useResponsive();
  const { employees, setEmployees, tasks, setTasks } = useData();

  const [tab, setTab] = useState<'employees' | 'habits'>('employees');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [restDays, setRestDays] = useState<number[]>([2]);
  const [error, setError] = useState('');
  /** Reveals the per-weekday chips for a rota the two presets do not cover. */
  const [customDays, setCustomDays] = useState(false);

  const [habitText, setHabitText] = useState('');
  const [habitScore, setHabitScore] = useState(2);

  const { armedId, confirm } = useConfirmAction();

  const toggleRestDay = useCallback((day: number) => {
    setRestDays((previous) =>
      previous.includes(day)
        ? previous.filter((candidate) => candidate !== day)
        : [...previous, day],
    );
  }, []);

  const addEmployee = useCallback(() => {
    if (!name.trim()) {
      setError('Нэр оруулна уу');
      return;
    }
    if (pin.length !== 4) {
      setError('PIN 4 оронтой байна');
      return;
    }
    if (employees.some((employee) => employee.pin === pin)) {
      setError('Энэ PIN аль хэдийн бүртгэгдсэн');
      return;
    }

    const employee: Employee = {
      id: nextId(),
      name: name.trim(),
      pin,
      restDays,
    };
    setEmployees((previous) => [...previous, employee]);
    setName('');
    setPin('');
    setRestDays([2]);
    setError('');
    show('Ажилтан нэмэгдлээ', 'success');
  }, [name, pin, restDays, employees, setEmployees, show]);

  const removeEmployee = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setEmployees((previous) => previous.filter((employee) => employee.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setEmployees, show],
  );

  const addHabit = useCallback(() => {
    if (!habitText.trim()) return;
    const habit: HabitTask = {
      id: nextId(),
      text: habitText.trim(),
      done: false,
      type: 'habit',
      score: habitScore,
    };
    setTasks((previous) => [...previous, habit]);
    setHabitText('');
    setHabitScore(2);
    show('Дадал нэмэгдлээ', 'success');
  }, [habitText, habitScore, setTasks, show]);

  const removeHabit = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setTasks((previous) => previous.filter((task) => task.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setTasks, show],
  );

  if (!can('viewAdmin')) {
    return (
      <Screen>
        <ScreenHeader title="Админ панел" onBack={() => navigation.goBack()} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Админ панел"
        onBack={() => navigation.goBack()}
        right={
          <Button
            mode="text"
            compact
            textColor="#ffffff"
            icon="cog"
            onPress={() => navigation.navigate('Settings' as never)}
          >
            Тохиргоо
          </Button>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value)}
          density="small"
          buttons={[
            { value: 'employees', label: '👤 Ажилтан' },
            { value: 'habits', label: '📋 Дадал тохиргоо' },
          ]}
        />

        {tab === 'employees' ? (
          <>
            {can('manageEmployees') ? (
              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Ажилтан нэмэх
                </Text>

                <TextInput
                  mode="outlined"
                  placeholder="Нэр (жш: Болд)"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError('');
                  }}
                  dense
                />
                <TextInput
                  mode="outlined"
                  placeholder="4 оронтой PIN (жш: 1234)"
                  value={pin}
                  onChangeText={(value) => {
                    setPin(value.replace(/\D/g, '').slice(0, 4));
                    setError('');
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  dense
                />

                <Text style={[styles.label, { color: theme.custom.mutedText }]}>
                  📝 Амрах хуваарь:
                </Text>

                <View style={styles.row}>
                  {REST_PRESETS.map((preset) => {
                    const active = sameDays(restDays, preset.days);
                    return (
                      <Pressable
                        key={preset.label}
                        onPress={() => {
                          setRestDays(preset.days);
                          setCustomDays(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.preset,
                          {
                            borderColor: active ? REST_ACCENT : theme.custom.subtleBorder,
                            backgroundColor: active
                              ? REST_ACCENT_SOFT
                              : theme.colors.surfaceVariant,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetLabel,
                            { color: active ? REST_ACCENT : theme.custom.mutedText },
                          ]}
                        >
                          {preset.label}
                        </Text>
                        <Text
                          style={[
                            styles.presetHint,
                            { color: active ? REST_ACCENT : theme.custom.mutedText },
                          ]}
                        >
                          {preset.hint}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* The two rotas above cover the shop, but a one-off pattern
                    still has to be possible — it just should not be in the way. */}
                <Pressable
                  onPress={() => setCustomDays((previous) => !previous)}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={[styles.toggle, { color: theme.colors.primary }]}>
                    {customDays ? '▲ Хаах' : '▼ Өөрөө сонгох'}
                  </Text>
                </Pressable>

                {customDays ? (
                  <View style={styles.dayRow}>
                    {DAY_LABELS_MN.map((label, index) => {
                      const active = restDays.includes(index);
                      return (
                        <Pressable
                          key={label}
                          onPress={() => toggleRestDay(index)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            styles.dayChip,
                            {
                              borderColor: active ? REST_ACCENT : theme.custom.subtleBorder,
                              backgroundColor: active
                                ? REST_ACCENT_SOFT
                                : theme.custom.cardBackground,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayChipText,
                              { color: active ? REST_ACCENT : theme.custom.mutedText },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button mode="contained" onPress={addEmployee} style={styles.addButton}>
                  + Нэмэх
                </Button>
              </Card>
            ) : null}

            {employees.length === 0 ? (
              <EmptyState
                icon="👤"
                title="Ажилтан бүртгэгдээгүй байна"
                hint="Дээрх формоор нэмнэ үү"
              />
            ) : (
              employees.map((employee) => {
                const armed = armedId === employee.id;
                return (
                  <Card key={employee.id} accentColor={armed ? '#dc2626' : undefined}>
                    <View style={styles.listRow}>
                      <View
                        style={[styles.avatar, { backgroundColor: theme.colors.surfaceVariant }]}
                      >
                        <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                          {employee.name.trim().charAt(0).toUpperCase() || '?'}
                        </Text>
                      </View>

                      <View style={styles.flex}>
                        <Text style={[styles.itemTitle, { color: theme.colors.onSurface }]}>
                          {employee.name}
                        </Text>
                        {/* The PIN is masked: a roster left open on the counter
                            should not hand out everyone's login. */}
                        <Text style={[styles.itemMeta, { color: theme.custom.mutedText }]}>
                          PIN: {'●'.repeat(employee.pin.length || 4)}
                        </Text>
                        <Text style={[styles.itemRest, { color: REST_ACCENT }]}>
                          😴 {restLabel(employee.restDays)}
                        </Text>
                      </View>

                      {can('manageEmployees') ? (
                        <IconButton
                          icon={armed ? 'trash-can' : 'trash-can-outline'}
                          size={20}
                          iconColor="#dc2626"
                          style={styles.trash}
                          accessibilityLabel={
                            armed ? `${employee.name} устгахыг батлах` : `${employee.name} устгах`
                          }
                          onPress={() => removeEmployee(employee.id)}
                        />
                      ) : null}
                    </View>
                  </Card>
                );
              })
            )}
          </>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Дадал нэмэх
              </Text>
              <TextInput
                mode="outlined"
                label="Дадлын нэр"
                value={habitText}
                onChangeText={setHabitText}
                dense
              />
              <View style={styles.row}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Button
                    key={score}
                    mode={habitScore === score ? 'contained' : 'outlined'}
                    onPress={() => setHabitScore(score)}
                    compact
                    style={styles.flex}
                  >
                    {score}⭐
                  </Button>
                ))}
              </View>
              <Button mode="contained" onPress={addHabit} disabled={!habitText.trim()}>
                + Нэмэх
              </Button>
            </Card>

            {tasks.map((task) => (
              <Card key={task.id}>
                <View style={styles.listRow}>
                  <Text style={styles.habitIcon}>
                    {task.type === 'cleaning' ? '🧹' : '⚡'}
                  </Text>
                  <View style={styles.flex}>
                    <Text style={[styles.itemTitle, { color: theme.colors.onSurface }]}>
                      {task.text}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.custom.mutedText }]}>
                      {task.score || 1} оноо
                    </Text>
                  </View>
                  <Button
                    mode="text"
                    compact
                    textColor={theme.colors.error}
                    onPress={() => removeHabit(task.id)}
                  >
                    {armedId === task.id ? 'Устгах?' : 'Устгах'}
                  </Button>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 12, gap: 10, paddingBottom: 40 },
  card: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  preset: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  presetLabel: { fontSize: 13, fontWeight: '800' },
  presetHint: { fontSize: 10, fontWeight: '600' },

  toggle: { fontSize: 11, fontWeight: '700', paddingVertical: 2 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    minWidth: 44,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dayChipText: { fontSize: 12, fontWeight: '800' },

  error: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
  addButton: { marginTop: 2 },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '900' },
  itemTitle: { fontSize: 14, fontWeight: '800' },
  itemMeta: { fontSize: 11, marginTop: 2 },
  itemRest: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  trash: { margin: 0 },
  habitIcon: { fontSize: 18 },
});
