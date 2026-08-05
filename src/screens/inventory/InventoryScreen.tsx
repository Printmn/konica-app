import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, FAB, Modal, Portal, SegmentedButtons, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CatalogRow } from '@/components/ui/CatalogRow';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchBar } from '@/components/ui/SearchBar';
import { getCategoryEmoji } from '@/constants/emoji';
import { useData } from '@/features/data/DataContext';
import {
  filterByStock,
  lowStockItems,
  searchInventory,
  stockCounts,
  type StockFilter,
} from '@/features/inventory/inventoryLogic';
import { addMissingSeedItems, missingSeedCount } from '@/features/inventory/stockSeed';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { captureImage, pickImageFromLibrary } from '@/services/media/imageService';
import { notifyLowStock } from '@/services/notifications/notificationService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { InventoryItem } from '@/types';
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
  /** Whole shelf, what is running low, or what has run out. */
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [draft, setDraft] = useState<DraftItem | null>(null);
  /** The photo currently open at full size, or `null`. */
  const [zoomed, setZoomed] = useState<InventoryItem | null>(null);
  const { armedId, confirm } = useConfirmAction();

  const canEdit = can('editCatalog');

  // Searched first, then filtered: the counts on the chips describe the whole
  // shelf, so they stay still while a search narrows the rows below them.
  const filtered = useMemo(
    () => filterByStock(searchInventory(inventory, debouncedSearch), stockFilter),
    [inventory, debouncedSearch, stockFilter],
  );
  const counts = useMemo(() => stockCounts(inventory), [inventory]);
  const lowStock = useMemo(() => lowStockItems(inventory), [inventory]);

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

  /**
   * How many of the shop's standing rows are not on the list yet. Zero once
   * they have all been added, which is what makes the button below disappear
   * on its own rather than sitting there forever.
   */
  const missing = useMemo(() => missingSeedCount(inventory), [inventory]);

  const addStandingStock = useCallback(() => {
    setInventory((previous) => addMissingSeedItems(previous));
    show(`${missing} бараа нэмэгдлээ`, 'success');
  }, [setInventory, show, missing]);

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

        <SegmentedButtons
          value={stockFilter}
          onValueChange={(value) => setStockFilter(value)}
          density="small"
          buttons={[
            { value: 'all', label: `Бүгд ${counts.all}` },
            { value: 'low', label: `Дуусч буй ${counts.low}` },
            { value: 'out', label: `Дууссан ${counts.out}` },
          ]}
        />
        {/* Only while something is missing: once the standing list is in, this
            has nothing left to do and takes itself away. */}
        {canEdit && missing > 0 ? (
          <Button mode="outlined" icon="playlist-plus" compact onPress={addStandingStock}>
            Үндсэн {missing} барааг нэмэх
          </Button>
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
            icon={stockFilter === 'out' ? '✅' : '📦'}
            title={
              stockFilter === 'out'
                ? 'Дууссан бараа алга'
                : stockFilter === 'low'
                  ? 'Дуусч буй бараа алга'
                  : search
                    ? 'Илэрц олдсонгүй'
                    : 'Бараа бүртгэгдээгүй байна'
            }
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
              onPressImage={() => setZoomed(item)}
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

      <ImageLightbox
        uri={zoomed?.image ?? null}
        title={zoomed?.name ?? ''}
        subtitle={zoomed?.price ?? ''}
        onDismiss={() => setZoomed(null)}
      />
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
