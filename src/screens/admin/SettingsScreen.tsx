import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Divider, List, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { PIN_LENGTH, setPin } from '@/authentication/authService';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { useData } from '@/features/data/DataContext';
import { parseWorkbook } from '@/services/export/excelService';
import { pickSpreadsheet } from '@/services/media/imageService';
import { clearErrorLog, formatErrorLog } from '@/services/monitoring/crashReporter';
import { saveTextAndShare } from '@/services/export/fileService';
import { clearExportFolder } from '@/services/export/fileService';
import {
  peekPushStatus,
  registerForPush,
  type PushStatus,
} from '@/services/notifications/pushRegistry';
import { createBackup, restoreBackup } from '@/services/sync/backupService';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { useAppTheme, useThemeMode } from '@/theme/ThemeProvider';
import type { InventoryItem } from '@/types';
import { nextId } from '@/utils/id';
import { parsePrice } from '@/utils/price';

/**
 * Settings: appearance, PINs, sync status, backup, and Excel import.
 *
 * Excel import is new — it fills the gap the shop's `Printmn_*.xlsx` files left,
 * letting a manager bulk-load the stock list instead of typing 40 rows. Rows are
 * matched on name, so an import updates existing items rather than duplicating.
 */

/** One line the counter can read, per push state. */
function pushSummary(status: PushStatus): { title: string; hint: string; icon: string } {
  switch (status.state) {
    case 'registered':
      return {
        title: 'Мэдэгдэл асаалттай',
        hint: `Энэ төхөөрөмж бүртгэгдсэн · ${status.token.slice(-12)}`,
        icon: 'bell-check',
      };
    case 'denied':
      return {
        title: 'Мэдэгдэл хаалттай',
        hint: 'Тохиргоо → Мэдэгдэл хэсгээс зөвшөөрөөд доорхыг дарна уу.',
        icon: 'bell-off',
      };
    case 'unpublished':
      return {
        title: 'Бүртгэгдээгүй байна',
        hint: `Серверт бичиж чадсангүй: ${status.reason}`,
        icon: 'bell-alert',
      };
    default:
      return {
        title: 'Мэдэгдэл боломжгүй',
        hint: status.reason,
        icon: 'bell-remove',
      };
  }
}

export function SettingsScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const navigation = useNavigation();
  const { mode, setMode } = useThemeMode();
  const { role, logout, can } = useAuth();
  const { show, showError } = useToast();
  const { gutter } = useResponsive();
  /**
   * Push state, shown rather than logged.
   *
   * A device that never registered is invisible from the outside: no error,
   * no alert, nothing to point at. This turns that into one readable line, and
   * a button that retries — which is the whole fix when someone allowed
   * notifications in Settings after the app had already started.
   */
  const [pushStatus, setPushStatus] = useState<PushStatus>(peekPushStatus);
  const [checkingPush, setCheckingPush] = useState(false);

  const recheckPush = useCallback(async () => {
    setCheckingPush(true);
    const next = await registerForPush(role ?? '', true);
    setPushStatus(next);
    setCheckingPush(false);
    show(
      next.state === 'registered'
        ? 'Мэдэгдэл бүртгэгдлээ'
        : 'Бүртгэж чадсангүй — доорх тайлбарыг уншина уу',
      next.state === 'registered' ? 'success' : 'error',
    );
  }, [role, show]);
  const {
    inventory,
    setInventory,
    isOffline,
    pendingWrites,
    lastSyncedAt,
    isSyncing,
    syncNow,
  } = useData();

  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);

  const changePin = useCallback(async () => {
    if (!role) return;
    if (newPin.length !== PIN_LENGTH) {
      show(`PIN ${PIN_LENGTH} оронтой байх ёстой`, 'error');
      return;
    }
    const saved = await setPin(role, newPin);
    show(saved ? 'PIN шинэчлэгдлээ' : 'PIN хадгалж чадсангүй', saved ? 'success' : 'error');
    setNewPin('');
  }, [role, newPin, show]);

  const shareErrors = useCallback(async () => {
    setBusy(true);
    const text = await formatErrorLog();
    const result = await saveTextAndShare(
      `printmn-errors-${Date.now()}.txt`,
      text,
      'txt',
      'Алдааны бүртгэл',
    );
    setBusy(false);
    if (!result.ok) showError(result.error);
  }, [showError]);

  const wipeErrors = useCallback(async () => {
    await clearErrorLog();
    show('Алдааны бүртгэл цэвэрлэгдлээ', 'success');
  }, [show]);

  const runBackup = useCallback(async () => {
    setBusy(true);
    const result = await createBackup();
    setBusy(false);
    if (!result.ok) showError(result.error);
    else show('Нөөц хуулбар үүслээ', 'success');
  }, [show, showError]);

  /**
   * Forgets the Android export folder so the next export offers the picker.
   * There is no way to show a folder-chooser for an already-granted folder, so
   * changing it means clearing the choice and letting the next export re-ask.
   */
  const resetExportFolder = useCallback(async () => {
    await clearExportFolder();
    show('Дараагийн тайлан гаргахад хавтас сонгоно', 'success');
  }, [show]);

  const runRestore = useCallback(async () => {
    setBusy(true);
    const result = await restoreBackup();
    setBusy(false);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    if (result.value === null) return;
    show(
      `${result.value.restoredKeys.length} багц сэргээгдлээ. Аппаа дахин нээнэ үү.`,
      'success',
    );
  }, [show, showError]);

  /**
   * Imports a stock spreadsheet.
   *
   * Expected headers: `Нэр`/`name`, `Үнэ`/`price`, `Үлдэгдэл`/`stock`,
   * `Ангилал`/`category`. Unknown columns are ignored; a name that already
   * exists is updated in place.
   */
  const importExcel = useCallback(async () => {
    setBusy(true);
    const picked = await pickSpreadsheet();
    if (!picked.ok) {
      setBusy(false);
      showError(picked.error);
      return;
    }
    if (picked.value === null) {
      setBusy(false);
      return;
    }

    const parsed = parseWorkbook(picked.value.base64);
    setBusy(false);
    if (!parsed.ok) {
      showError(parsed.error);
      return;
    }

    // Spreadsheet cells arrive as `unknown`; only scalars are meaningful here,
    // and an object would otherwise stringify to "[object Object]".
    const pick = (row: Record<string, unknown>, ...keys: string[]): string => {
      for (const key of keys) {
        const value = row[key];
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        const text = String(value).trim();
        if (text !== '') return text;
      }
      return '';
    };

    let added = 0;
    let updated = 0;

    setInventory((previous) => {
      const next = [...previous];
      for (const row of parsed.value) {
        const record = row as Record<string, unknown>;
        const name = pick(record, 'Нэр', 'НЭР', 'name', 'Name');
        if (!name) continue;

        const price = pick(record, 'Үнэ', 'ҮНЭ', 'price', 'Price');
        const stock = pick(record, 'Үлдэгдэл', 'ҮЛДЭГДЭЛ', 'stock', 'Stock');
        const category = pick(record, 'Ангилал', 'АНГИЛАЛ', 'category', 'Category');

        const index = next.findIndex((item) => item.name === name);
        if (index >= 0) {
          const existing = next[index] as InventoryItem;
          next[index] = {
            ...existing,
            price: price ? `${parsePrice(price).toLocaleString()}₮` : existing.price,
            stock: stock || existing.stock,
            category: category || existing.category,
          };
          updated += 1;
        } else {
          next.push({
            id: nextId(),
            name,
            price: price ? `${parsePrice(price).toLocaleString()}₮` : '0₮',
            stock: stock || '0',
            category: category || 'Бусад',
            image: null,
          });
          added += 1;
        }
      }
      return next;
    });

    show(`Импорт: ${added} шинэ, ${updated} шинэчлэгдсэн`, 'success');
  }, [setInventory, show, showError]);

  return (
    <Screen>
      <ScreenHeader title="Тохиргоо" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            🎨 Харагдах байдал
          </Text>
          <SegmentedButtons
            value={mode}
            onValueChange={(value) => setMode(value)}
            density="small"
            buttons={[
              { value: 'light', label: 'Цайвар', icon: 'white-balance-sunny' },
              { value: 'dark', label: 'Бараан', icon: 'weather-night' },
              { value: 'system', label: 'Систем', icon: 'cellphone' },
            ]}
          />
        </Card>

        <Card style={styles.card} padded={false}>
          <List.Section title="🔄 Синк">
            <List.Item
              title={isOffline ? 'Офлайн' : 'Онлайн'}
              description={
                lastSyncedAt
                  ? `Сүүлд: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                  : 'Хараахан синк хийгээгүй'
              }
              left={(props) => (
                <List.Icon {...props} icon={isOffline ? 'wifi-off' : 'wifi'} />
              )}
            />
            <List.Item
              title="Хүлээгдэж буй өөрчлөлт"
              description={`${pendingWrites} бичилт дараалалд байна`}
              left={(props) => <List.Icon {...props} icon="tray-arrow-up" />}
            />
            <Divider />
            <View style={styles.inline}>
              <Button
                mode="contained-tonal"
                icon="sync"
                loading={isSyncing}
                disabled={isSyncing || isOffline}
                onPress={() => void syncNow()}
                style={styles.flex}
              >
                Одоо синк хийх
              </Button>
            </View>
          </List.Section>
        </Card>

        <Card style={styles.card} padded={false}>
          <List.Section title="🔔 Мэдэгдэл">
            <List.Item
              title={pushSummary(pushStatus).title}
              description={pushSummary(pushStatus).hint}
              descriptionNumberOfLines={3}
              left={(props) => <List.Icon {...props} icon={pushSummary(pushStatus).icon} />}
            />
            <Divider />
            <View style={styles.inline}>
              <Button
                mode="contained-tonal"
                icon="bell-ring"
                loading={checkingPush}
                disabled={checkingPush}
                onPress={() => void recheckPush()}
                style={styles.flex}
              >
                Мэдэгдэл дахин холбох
              </Button>
            </View>
          </List.Section>
        </Card>

        {can('exportData') ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              💾 Нөөцлөх & Сэргээх
            </Text>
            <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
              Бүх өгөгдлийг нэг JSON файлд хадгална. Сэргээсний дараа аппаа дахин нээнэ үү.
            </Text>
            <View style={styles.row}>
              <Button
                mode="contained-tonal"
                icon="cloud-upload"
                onPress={() => void runBackup()}
                disabled={busy}
                style={styles.flex}
              >
                Нөөцлөх
              </Button>
              <Button
                mode="outlined"
                icon="cloud-download"
                onPress={() => void runRestore()}
                disabled={busy}
                style={styles.flex}
              >
                Сэргээх
              </Button>
            </View>

            {Platform.OS === 'android' ? (
              <>
                <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                  Excel тайлан таны сонгосон хавтас руу шууд хадгалагдана. Өөр
                  хавтас руу хадгалахыг хүсвэл доорхыг дарна уу — дараагийн
                  тайлан гаргахад хавтас сонгох цонх дахин гарна.
                </Text>
                <Button
                  mode="text"
                  icon="folder-cog-outline"
                  onPress={() => void resetExportFolder()}
                  disabled={busy}
                >
                  Хадгалах хавтсыг өөрчлөх
                </Button>
              </>
            ) : null}
          </Card>
        ) : null}

        {can('changeSettings') ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              🐞 Алдааны бүртгэл
            </Text>
            <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
              Сүүлийн үеийн алдаанууд төхөөрөмж дээр хадгалагдана. Апп гэнэт хаагдвал
              энэ файлыг илгээж өгвөл шалтгааныг олоход тусална.
            </Text>
            <View style={styles.row}>
              <Button
                mode="contained-tonal"
                icon="bug"
                onPress={() => void shareErrors()}
                disabled={busy}
                style={styles.flex}
              >
                Илгээх
              </Button>
              <Button
                mode="outlined"
                icon="delete-sweep"
                onPress={() => void wipeErrors()}
                disabled={busy}
                style={styles.flex}
              >
                Цэвэрлэх
              </Button>
            </View>
          </Card>
        ) : null}

        {can('editCatalog') ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              📥 Excel импорт
            </Text>
            <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
              Баганын гарчиг: Нэр, Үнэ, Үлдэгдэл, Ангилал. Ижил нэртэй бараа шинэчлэгдэнэ.
              Одоо {inventory.length} бараа бүртгэлтэй.
            </Text>
            <Button
              mode="contained-tonal"
              icon="microsoft-excel"
              onPress={() => void importExcel()}
              disabled={busy}
            >
              Excel файл сонгох
            </Button>
          </Card>
        ) : null}

        {can('changeSettings') ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              🔐 PIN солих
            </Text>
            <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
              Шинэ PIN нь зөвхөн энэ төхөөрөмжийн аюулгүй санд хадгалагдана.
            </Text>
            <TextInput
              mode="outlined"
              label={`Шинэ PIN (${PIN_LENGTH} орон)`}
              value={newPin}
              onChangeText={(value) => setNewPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH}
              dense
            />
            <Button
              mode="contained"
              onPress={() => void changePin()}
              disabled={newPin.length !== PIN_LENGTH}
            >
              Хадгалах
            </Button>
          </Card>
        ) : null}

        <Button
          mode="outlined"
          icon="logout"
          textColor={theme.colors.error}
          onPress={() => void logout()}
          style={styles.logout}
        >
          Гарах
        </Button>

        <Text style={[styles.version, { color: theme.custom.mutedText }]}>
          Printmn Konica · v2.0.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 12, gap: 10, paddingBottom: 40 },
  card: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  hint: { fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8 },
  inline: { paddingHorizontal: 12, paddingBottom: 8 },
  flex: { flex: 1 },
  logout: { marginTop: 8 },
  version: { fontSize: 10, textAlign: 'center', marginTop: 4 },
});
