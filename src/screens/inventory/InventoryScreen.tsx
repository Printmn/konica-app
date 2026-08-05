import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, FAB, Modal, Portal, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CatalogRow } from '@/components/ui/CatalogRow';
import { SearchBar } from '@/components/ui/SearchBar';
import { StatTile } from '@/components/ui/StatTile';
import { getCategoryEmoji } from '@/constants/emoji';
import { useData } from '@/features/data/DataContext';
import {
  inventoryValue,
  lowStockItems,
  searchInventory,
} from '@/features/inventory/inventoryLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { captureImage, pickImageFromLibrary } from '@/services/media/imageService';
import { notifyLowStock } from '@/services/notifications/notificationService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { InventoryItem } from '@/types';
import { formatCurrency } from '@/utils/price';
import { nextId } from '@/utils/id';

/**
 * Stock list.
 *
 * Workers get a read-only price list — the same restriction the web build had —
 * while managers can add, edit and photograph items. Photos go through
 * expo-image-picker and are compressed to the same 400px / q0.7 JPEG the web
 * canvas produced, so the Firebase payload stays the size it was.
 */

interface DraftItem {
  id: number | null;
  name: string;
  price: string;
  stock: string;
  category: string;
  image: string | null;
}

const emptyDraft = (): DraftItem => ({
  id: null,
  name: '',
  price: '',
  stock: '',
  category: '',
  image: null,
});

export function InventoryScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { can } = useAuth();
  const { show, showError } = useToast();
  const { gutter } = useResponsive();
  const { inventory, setInventory, isOffline, pendingWrites, syncError, syncNow } =
    useData();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [draft, setDraft] = useState<DraftItem | null>(null);
  const { armedId, confirm } = useConfirmAction();

  const canEdit = can('editCatalog');

  const filtered = useMemo(
    () => searchInventory(inventory, debouncedSearch),
    [inventory, debouncedSearch],
  );
  const lowStock = useMemo(() => lowStockItems(inventory), [inventory]);
  const totalValue = useMemo(() => inventoryValue(inventory), [inventory]);

  const attachImage = useCallback(
    async (fromCamera: boolean) => {
      const result = fromCamera ? await captureImage() : await pickImageFromLibrary();
      if (!result.ok) {
        showError(result.error);
        return;
      }
      if (result.value === null) return;
      setDraft((previous) => (previous ? { ...previous, image: result.value } : previous));
    },
    [showError],
  );

  const saveDraft = useCallback(() => {
    if (!draft) return;
    if (!draft.name.trim()) {
      show('Барааны нэрийг оруулна уу!', 'error');
      return;
    }

    const payload: InventoryItem = {
      id: draft.id ?? nextId(),
      name: draft.name.trim(),
      price: draft.price.trim(),
      stock: draft.stock.trim(),
      category: draft.category.trim() || 'Бусад',
      image: draft.image,
    };

    setInventory((previous) =>
      draft.id === null
        ? [payload, ...previous]
        : previous.map((item) => (item.id === draft.id ? payload : item)),
    );

    setDraft(null);
    show(draft.id === null ? 'Бараа нэмэгдлээ' : 'Хадгаллаа', 'success');
  }, [draft, setInventory, show]);

  const deleteItem = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setInventory((previous) => previous.filter((item) => item.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setInventory, show],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Барааны үнэ"
        onBack={onBack}
        subtitle={`${inventory.length} нэр төрөл`}
        right={
          lowStock.length > 0 ? (
            <Button
              mode="text"
              compact
              textColor="#ffffff"
              onPress={() => void notifyLowStock(lowStock)}
            >
              ⚠️ {lowStock.length}
            </Button>
          ) : undefined
        }
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <SearchBar value={search} onChange={setSearch} placeholder="Барааны нэрээр хайх..." />
        {can('viewReport') ? (
          <View style={styles.stats}>
            <StatTile label="Нийт үнэлгээ" value={formatCurrency(totalValue)} icon="📦" />
            <StatTile
              label="Дуусч буй"
              value={String(lowStock.length)}
              icon="⚠️"
              tint="#f59e0b"
            />
          </View>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="📦"
            title={search ? 'Илэрц олдсонгүй' : 'Бараа бүртгэгдээгүй байна'}
          />
        }
        renderItem={({ item }) => (
          <View>
            <CatalogRow
              item={item}
              emoji={getCategoryEmoji(item.category)}
              showStock
              onPress={
                canEdit
                  ? () =>
                      setDraft({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        stock: item.stock,
                        category: item.category,
                        image: item.image,
                      })
                  : undefined
              }
              onLongPress={canEdit ? () => deleteItem(item.id) : undefined}
            />
            {armedId === item.id ? (
              <Text style={styles.confirmHint}>Устгахын тулд дахин удаан дарна уу</Text>
            ) : null}
          </View>
        )}
      />

      {canEdit ? (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => setDraft(emptyDraft())}
          accessibilityLabel="Шинэ бараа нэмэх"
        />
      ) : null}

      <Portal>
        <Modal
          visible={draft !== null}
          onDismiss={() => setDraft(null)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {draft?.id === null ? 'Бараа бүртгэх' : 'Бараа засах'}
          </Text>

          <TextInput
            mode="outlined"
            label="Барааны нэр"
            value={draft?.name ?? ''}
            onChangeText={(value) =>
              setDraft((previous) => (previous ? { ...previous, name: value } : previous))
            }
            dense
          />
          <View style={styles.row}>
            <TextInput
              mode="outlined"
              label="Үнэ"
              value={draft?.price ?? ''}
              onChangeText={(value) =>
                setDraft((previous) => (previous ? { ...previous, price: value } : previous))
              }
              placeholder="8,500₮"
              style={styles.flex}
              dense
            />
            <TextInput
              mode="outlined"
              label="Үлдэгдэл"
              value={draft?.stock ?? ''}
              onChangeText={(value) =>
                setDraft((previous) => (previous ? { ...previous, stock: value } : previous))
              }
              keyboardType="number-pad"
              style={styles.flex}
              dense
            />
          </View>
          <TextInput
            mode="outlined"
            label="Ангилал"
            value={draft?.category ?? ''}
            onChangeText={(value) =>
              setDraft((previous) => (previous ? { ...previous, category: value } : previous))
            }
            placeholder="Жааз, Цаас, Альбом..."
            dense
          />

          <View style={styles.row}>
            <Button
              mode="outlined"
              icon="image"
              onPress={() => void attachImage(false)}
              style={styles.flex}
            >
              Зураг
            </Button>
            <Button
              mode="outlined"
              icon="camera"
              onPress={() => void attachImage(true)}
              style={styles.flex}
            >
              Камер
            </Button>
          </View>

          <View style={styles.row}>
            <Button mode="outlined" onPress={() => setDraft(null)} style={styles.flex}>
              Болих
            </Button>
            <Button mode="contained" onPress={saveDraft} style={styles.flex}>
              Хадгалах
            </Button>
          </View>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: 10, gap: 10 },
  stats: { flexDirection: 'row', gap: 8 },
  list: { paddingBottom: 96 },
  separator: { height: 8 },
  confirmHint: { fontSize: 10, color: '#dc2626', textAlign: 'center', paddingTop: 4 },
  fab: { position: 'absolute', right: 20, bottom: 24 },
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
