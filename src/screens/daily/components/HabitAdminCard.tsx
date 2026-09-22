import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { Card } from '@/components/ui/Card';
import { MAX_MONTHLY_BONUS } from '@/constants/config';
import { useData } from '@/features/data/DataContext';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { HabitTask } from '@/types';
import { nextId } from '@/utils/id';

/**
 * The habits, and what a month of them is worth.
 *
 * Both are the manager's to set and neither had a home once clocking in became
 * staff-only: the habit list lived inside the arrival card, so whoever managed
 * the habits could add one and never see what was already there, and the bonus
 * ceiling was a constant compiled into the app.
 *
 * Shared by the Цаг & Дадал screen and the manager's Ажилтан screen. Two copies
 * of the editor for the numbers that decide people's pay is how the two quietly
 * stop agreeing.
 */
export function HabitAdminCard(): React.JSX.Element {
  const theme = useAppTheme();
  const { show } = useToast();
  const { tasks, setTasks, timeSettings, setTimeSettings } = useData();
  const { armedId, confirm } = useConfirmAction();

  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskScore, setNewTaskScore] = useState(2);

  const addTask = useCallback(() => {
    if (!newTaskText.trim()) return;
    const task: HabitTask = {
      id: nextId(),
      text: newTaskText.trim(),
      done: false,
      type: 'habit',
      score: newTaskScore,
    };
    setTasks((previous) => [...previous, task]);
    setNewTaskText('');
    setNewTaskScore(2);
  }, [newTaskText, newTaskScore, setTasks]);

  const removeTask = useCallback(
    (id: number) => {
      setTasks((previous) => previous.filter((task) => task.id !== id));
      show('Дадал устгалаа', 'success');
    },
    [setTasks, show],
  );

  return (
    <Card style={styles.card}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
        ⚡ Дадал & урамшуулал
      </Text>

      <TextInput
        mode="outlined"
        label="Дадлын нэр"
        value={newTaskText}
        onChangeText={setNewTaskText}
        dense
      />

      <View style={styles.scoreRow}>
        <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>Оноо</Text>
        {[1, 2, 3, 4, 5].map((score) => (
          <Pressable
            key={score}
            onPress={() => setNewTaskScore(score)}
            accessibilityRole="button"
            accessibilityState={{ selected: newTaskScore === score }}
            style={[
              styles.scoreDot,
              {
                backgroundColor: newTaskScore === score ? '#f59e0b' : theme.custom.cardBackground,
                borderColor: newTaskScore === score ? '#f59e0b' : theme.colors.outline,
              },
            ]}
          >
            <Text
              style={[
                styles.scoreDotText,
                { color: newTaskScore === score ? '#ffffff' : theme.custom.mutedText },
              ]}
            >
              {score}
            </Text>
          </Pressable>
        ))}
      </View>

      <Button mode="contained-tonal" onPress={addTask} disabled={!newTaskText.trim()}>
        Нэмэх
      </Button>

      {tasks.length === 0 ? (
        <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
          Дадал бүртгэгдээгүй байна
        </Text>
      ) : (
        tasks.map((task) => (
          <View
            key={task.id}
            style={[
              styles.habitRow,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.custom.subtleBorder,
              },
            ]}
          >
            <Text style={[styles.habitText, { color: theme.colors.onSurface }]} numberOfLines={2}>
              {task.type === 'cleaning' ? '🧹' : '⚡'} {task.text}
            </Text>
            <Text style={styles.habitScore}>+{task.score || 1}⭐</Text>
            <Pressable
              onPress={() => confirm(task.id, () => removeTask(task.id))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${task.text} устгах`}
            >
              <Text style={armedId === task.id ? styles.deleteArmed : styles.deleteIcon}>
                {armedId === task.id ? 'УСТГАХ' : '🗑'}
              </Text>
            </Pressable>
          </View>
        ))
      )}

      {/* The one figure in the bonus calculation the manager has an opinion
          about. Cleared or nonsensical falls back to the old constant rather
          than silently zeroing everybody's month. */}
      <TextInput
        mode="outlined"
        label="Урамшууллын дээд хэмжээ (₮)"
        value={String(timeSettings.maxBonus ?? MAX_MONTHLY_BONUS)}
        onChangeText={(value) =>
          setTimeSettings((previous) => ({
            ...previous,
            maxBonus: Number(value.replace(/[^0-9]/g, '')) || MAX_MONTHLY_BONUS,
          }))
        }
        keyboardType="number-pad"
        dense
      />
      <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
        Бүтэн биелүүлсэн сар энэ дүнг авна. Хагас биелүүлбэл хагасыг.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDotText: { fontSize: 12, fontWeight: '900' },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  habitText: { flex: 1, fontSize: 12, fontWeight: '700' },
  habitScore: { fontSize: 10, fontWeight: '900', color: '#f59e0b' },
  deleteIcon: { fontSize: 14, opacity: 0.4 },
  deleteArmed: { fontSize: 10, fontWeight: '900', color: '#dc2626' },
  hint: { fontSize: 11, lineHeight: 16 },
});
