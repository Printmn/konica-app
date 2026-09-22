import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState } from '@/components/feedback/StateViews';
import { Card } from '@/components/ui/Card';
import { useData } from '@/features/data/DataContext';
import {
  applyProfile,
  isBirthdayToday,
  longDate,
  missingFields,
  profileOf,
  tenureLabel,
  type ProfileDraft,
} from '@/features/employees/employeeProfile';
import { useToast } from '@/hooks/useToast';
import { compressImage, pickImageFromLibrary } from '@/services/media/imageService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { Employee } from '@/types';

/**
 * Хувийн мэдээлэл — the handful of personal details a print shop needs.
 *
 * A phone number to call, a birthday, and somebody to ring if a guillotine
 * takes a finger. The photo earns its place by making the attendance list
 * readable at a glance rather than by decorating this screen.
 *
 * Who may edit whom:
 *  * a member of staff edits their own row and nobody else's;
 *  * a manager picks any name and edits that one.
 *
 * The date fields are plain `YYYY-MM-DD` text. A calendar for a birth date
 * thirty years ago means thirty taps on a month arrow.
 */
export function ProfileTab(): React.JSX.Element {
  const theme = useAppTheme();
  const { show } = useToast();
  const { role, workerName, can } = useAuth();
  const { employees, setEmployees } = useData();

  const isManager = can('manageEmployees');
  const own = employees.find((employee) => employee.name === workerName);

  const [selectedId, setSelectedId] = useState<number | null>(own?.id ?? null);
  const selected: Employee | undefined =
    employees.find((employee) => employee.id === selectedId) ?? (isManager ? undefined : own);

  const [draft, setDraft] = useState<ProfileDraft>(() => profileOf(selected));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Follows the chosen person, and any change synced from the other device —
  // but never overwrites an edit in progress.
  useEffect(() => {
    if (dirty) return;
    setDraft(profileOf(selected));
  }, [selected, dirty]);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]): void => {
    setDirty(true);
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const save = useCallback(() => {
    if (selected === undefined) return;
    setEmployees((previous) => applyProfile(previous, selected.id, draft));
    setDirty(false);
    show('Хадгаллаа', 'success');
  }, [selected, draft, setEmployees, show]);

  const choosePhoto = useCallback(async () => {
    setBusy(true);
    try {
      const picked = await pickImageFromLibrary();
      if (!picked.ok || picked.value === null) return;
      // Same 400px/JPEG contract as every other photo — these strings go
      // straight into Firebase and the payload budget depends on it.
      const compressed = await compressImage(picked.value);
      if (!compressed.ok) {
        show('Зургийг боловсруулж чадсангүй', 'error');
        return;
      }
      setDirty(true);
      setDraft((previous) => ({ ...previous, photo: compressed.value }));
    } finally {
      setBusy(false);
    }
  }, [show]);

  if (employees.length === 0) {
    return (
      <EmptyState
        icon="👤"
        title="Ажилтан бүртгэгдээгүй байна"
        hint={isManager ? 'Ажилтан удирдах хэсгээс нэмнэ үү' : undefined}
      />
    );
  }

  if (selected === undefined) {
    return (
      <>
        {isManager ? <Roster employees={employees} selectedId={selectedId} onSelect={setSelectedId} /> : null}
        <EmptyState icon="👤" title="Ажилтнаа сонгоно уу" />
      </>
    );
  }

  const gaps = missingFields(selected);
  const tenure = tenureLabel(draft.startDate);

  return (
    <>
      {isManager ? (
        <Roster employees={employees} selectedId={selected.id} onSelect={setSelectedId} />
      ) : null}

      <Card style={styles.card}>
        <View style={styles.head}>
          <Pressable
            onPress={() => void choosePhoto()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Зураг солих"
            style={[
              styles.photoWrap,
              { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            {draft.photo ? (
              <Image
                source={{ uri: draft.photo }}
                style={styles.photo}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Icon source="camera-plus" size={26} color={theme.colors.primary} />
            )}
          </Pressable>

          <View style={styles.flex}>
            <Text style={[styles.name, { color: theme.colors.onSurface }]}>{selected.name}</Text>
            {tenure ? (
              <Text style={[styles.tenure, { color: theme.colors.primary }]}>
                🏆 {tenure} ажиллаж байна
              </Text>
            ) : null}
            {isBirthdayToday(draft.birthDate) ? (
              <Text style={[styles.birthday, { color: '#f59e0b' }]}>🎂 Өнөөдөр төрсөн өдөр!</Text>
            ) : null}
            {role === 'worker' ? null : (
              <Text style={[styles.meta, { color: theme.custom.mutedText }]}>
                PIN: {selected.pin || '—'}
              </Text>
            )}
          </View>
        </View>

        {gaps.length > 0 ? (
          <Text style={[styles.gaps, { color: theme.custom.mutedText }]}>
            Дутуу: {gaps.join(', ')}
          </Text>
        ) : null}

        <TextInput
          mode="outlined"
          label="Утас"
          value={draft.phone}
          onChangeText={(value) => set('phone', value)}
          keyboardType="phone-pad"
          right={
            draft.phone ? (
              <TextInput.Icon
                icon="phone"
                onPress={() => void Linking.openURL(`tel:${draft.phone}`)}
              />
            ) : undefined
          }
          dense
        />

        <TextInput
          mode="outlined"
          label="Төрсөн өдөр"
          value={draft.birthDate}
          onChangeText={(value) => set('birthDate', value)}
          placeholder="1994-08-04"
          keyboardType="numbers-and-punctuation"
          dense
        />

        <TextInput
          mode="outlined"
          label="Оршин суугаа хаяг"
          value={draft.address}
          onChangeText={(value) => set('address', value)}
          multiline
          dense
        />

        <Text style={[styles.sectionLabel, { color: theme.custom.mutedText }]}>
          ЯАРАЛТАЙ ҮЕД ХОЛБОО БАРИХ
        </Text>
        <TextInput
          mode="outlined"
          label="Нэр"
          value={draft.emergencyName}
          onChangeText={(value) => set('emergencyName', value)}
          dense
        />
        <TextInput
          mode="outlined"
          label="Утас"
          value={draft.emergencyPhone}
          onChangeText={(value) => set('emergencyPhone', value)}
          keyboardType="phone-pad"
          right={
            draft.emergencyPhone ? (
              <TextInput.Icon
                icon="phone"
                onPress={() => void Linking.openURL(`tel:${draft.emergencyPhone}`)}
              />
            ) : undefined
          }
          dense
        />

        <TextInput
          mode="outlined"
          label="Ажилд орсон огноо"
          value={draft.startDate}
          onChangeText={(value) => set('startDate', value)}
          placeholder="2024-03-15"
          keyboardType="numbers-and-punctuation"
          dense
        />
        {longDate(draft.startDate) ? (
          <Text style={[styles.meta, { color: theme.custom.mutedText }]}>
            {longDate(draft.startDate)}
            {tenure ? ` · ${tenure}` : ''}
          </Text>
        ) : null}

        <Button
          mode="contained"
          icon="content-save"
          onPress={save}
          disabled={!dirty || busy}
          style={styles.save}
        >
          Хадгалах
        </Button>
      </Card>
    </>
  );
}

/** The manager's name picker. Staff never see it — they have one row. */
function Roster({
  employees,
  selectedId,
  onSelect,
}: {
  employees: readonly Employee[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}): React.JSX.Element {
  const theme = useAppTheme();
  return (
    <View style={styles.roster}>
      {employees.map((employee) => {
        const active = employee.id === selectedId;
        return (
          <Pressable
            key={employee.id}
            onPress={() => onSelect(employee.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.rosterChip,
              {
                backgroundColor: active ? theme.custom.selected : theme.custom.cardBackground,
                borderColor: active ? theme.custom.selected : theme.custom.subtleBorder,
              },
            ]}
          >
            {employee.photo ? (
              <Image source={{ uri: employee.photo }} style={styles.rosterPhoto} contentFit="cover" />
            ) : null}
            <Text
              style={[
                styles.rosterText,
                { color: active ? theme.custom.onSelected : theme.colors.onSurface },
              ]}
              numberOfLines={1}
            >
              {employee.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  name: { fontSize: 18, fontWeight: '900' },
  tenure: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  birthday: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  meta: { fontSize: 11, marginTop: 2 },
  gaps: { fontSize: 11, lineHeight: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginTop: 4 },
  save: { marginTop: 6 },

  roster: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rosterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  rosterPhoto: { width: 20, height: 20, borderRadius: 10 },
  rosterText: { fontSize: 12, fontWeight: '800' },
});
