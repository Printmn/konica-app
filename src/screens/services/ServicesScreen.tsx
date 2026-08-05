import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, IconButton, Modal, Portal, TextInput } from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { EmptyState, OfflineBanner, SyncErrorBanner } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchBar } from '@/components/ui/SearchBar';
import { getServiceEmoji } from '@/constants/emoji';
import { useData } from '@/features/data/DataContext';
import { searchServices } from '@/features/inventory/inventoryLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import { captureImage, pickImageFromLibrary } from '@/services/media/imageService';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { ServiceItem } from '@/types';
import { nextId } from '@/utils/id';

/**
 * Printing price list.
 *
 * One flat, numbered list: the counter clerk quoting a price over the phone
 * needs it now, not after picking a folder. Searching matches the category as
 * well as the name, and each row carries its category as a chip — tap it to
 * filter by that category, long-press it (managers only) to rename the
 * category across every service at once, which is what the folder view's
 * `handleRenameCategory` used to do.
 */

interface DraftService {
  id: number | null;
  name: string;
  price: string;
  category: string;
  image: string | null;
}

export function ServicesScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { can } = useAuth();
  const { show, showError } = useToast();
  const { gutter } = useResponsive();
  const { services, setServices, isOffline, pendingWrites, syncError, syncNow } =
    useData();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [draft, setDraft] = useState<DraftService | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  /** The photo currently open at full size, or `null`. */
  const [zoomed, setZoomed] = useState<ServiceItem | null>(null);
  const { armedId, confirm } = useConfirmAction();

  const canEdit = can('editCatalog');

  /**
   * One flat, numbered list rather than a folder step.
   *
   * Browsing by category meant two taps before seeing a price, and the counter
   * clerk quoting over the phone needs the price now. The category is still
   * visible as a chip on each row and `searchServices` already matches on it,
   * so filtering by category is a search away rather than a screen away.
   */
  const visible = useMemo(
    () => searchServices(services, debouncedSearch),
    [services, debouncedSearch],
  );

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
      show('Үйлчилгээний нэрийг оруулна уу!', 'error');
      return;
    }

    const payload: ServiceItem = {
      id: draft.id ?? nextId(),
      name: draft.name.trim(),
      price: draft.price.trim() || '0₮',
      category: draft.category.trim() || 'Бусад',
      image: draft.image,
    };

    setServices((previous) =>
      draft.id === null
        ? [...previous, payload]
        : previous.map((service) => (service.id === draft.id ? payload : service)),
    );

    setDraft(null);
    show(draft.id === null ? 'Үйлчилгээ нэмэгдлээ' : 'Хадгаллаа', 'success');
  }, [draft, setServices, show]);

  const deleteService = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setServices((previous) => previous.filter((service) => service.id !== confirmedId));
        show('Устгалаа');
      });
    },
    [confirm, setServices, show],
  );

  const applyRename = useCallback(() => {
    if (!renaming) return;
    const next = renaming.to.trim();
    if (!next || next === renaming.from) {
      setRenaming(null);
      return;
    }
    setServices((previous) =>
      previous.map((service) =>
        service.category === renaming.from ? { ...service, category: next } : service,
      ),
    );
    setRenaming(null);
    show('Ангилал шинэчлэгдлээ', 'success');
  }, [renaming, setServices, show]);

  return (
    <Screen>
      <ScreenHeader title="Хэвлэлийн үнэ" onBack={onBack} />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Хэвлэлийн үнэ, ангиллаар хайх..."
            />

            {canEdit ? (
              <Pressable
                onPress={() =>
                  setDraft({ id: null, name: '', price: '', category: '', image: null })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.addButton,
                  {
                    borderColor: theme.colors.primary,
                    backgroundColor: theme.custom.cardBackground,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Icon source="plus-circle-outline" size={22} color={theme.colors.primary} />
                <Text style={[styles.addLabel, { color: theme.colors.primary }]}>
                  Шинэ үнэ нэмэх
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.count, { color: theme.custom.mutedText }]}>
              {debouncedSearch
                ? `ОЛДСОН ${visible.length} ХЭВЛЭЛИЙН ҮНЭ`
                : `НИЙТ ${visible.length} ХЭВЛЭЛИЙН ҮНЭ`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🔍"
            title={debouncedSearch ? 'Илэрц олдсонгүй' : 'Үнэ бүртгэгдээгүй байна'}
          />
        }
        renderItem={({ item, index }) => {
          const armed = armedId === item.id;
          return (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: theme.custom.cardBackground,
                  borderColor: armed ? '#dc2626' : theme.custom.subtleBorder,
                },
              ]}
            >
              <Pressable
                onPress={item.image ? () => setZoomed(item) : undefined}
                disabled={!item.image}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} зураг харах`}
                style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}
              >
                {item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.thumbImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text style={styles.thumbEmoji}>
                    {getServiceEmoji(item.name, item.category)}
                  </Text>
                )}
              </Pressable>

              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.colors.onSurface }]} numberOfLines={2}>
                  <Text style={[styles.index, { color: theme.custom.mutedText }]}>
                    {index + 1}.{' '}
                  </Text>
                  {item.name}
                </Text>
                <Text style={[styles.price, { color: theme.colors.primary }]}>
                  {item.price}
                </Text>
              </View>

              {item.category ? (
                <Pressable
                  onPress={() => setSearch(item.category)}
                  onLongPress={
                    canEdit
                      ? () => setRenaming({ from: item.category, to: item.category })
                      : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.category} ангиллаар шүүх`}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: theme.colors.surfaceVariant },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: theme.custom.mutedText }]}
                    numberOfLines={1}
                  >
                    {item.category}
                  </Text>
                </Pressable>
              ) : null}

              {canEdit ? (
                <View style={styles.actions}>
                  <IconButton
                    icon="square-edit-outline"
                    size={18}
                    iconColor={theme.colors.primary}
                    style={styles.action}
                    accessibilityLabel={`${item.name} засах`}
                    onPress={() =>
                      setDraft({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        category: item.category,
                        image: item.image,
                      })
                    }
                  />
                  <IconButton
                    icon={armed ? 'trash-can' : 'trash-can-outline'}
                    size={18}
                    iconColor="#dc2626"
                    style={styles.action}
                    accessibilityLabel={
                      armed ? `${item.name} устгахыг батлах` : `${item.name} устгах`
                    }
                    onPress={() => deleteService(item.id)}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <Portal>
        <Modal
          visible={draft !== null}
          onDismiss={() => setDraft(null)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {draft?.id === null ? 'Үйлчилгээ нэмэх' : 'Үйлчилгээ засах'}
          </Text>

          <TextInput
            mode="outlined"
            label="Нэр"
            value={draft?.name ?? ''}
            onChangeText={(value) =>
              setDraft((previous) => (previous ? { ...previous, name: value } : previous))
            }
            dense
          />
          <View style={styles.modalRow}>
            <TextInput
              mode="outlined"
              label="Үнэ"
              value={draft?.price ?? ''}
              onChangeText={(value) =>
                setDraft((previous) => (previous ? { ...previous, price: value } : previous))
              }
              placeholder="5,000₮"
              style={styles.flex}
              dense
            />
            <TextInput
              mode="outlined"
              label="Ангилал"
              value={draft?.category ?? ''}
              onChangeText={(value) =>
                setDraft((previous) => (previous ? { ...previous, category: value } : previous))
              }
              style={styles.flex}
              dense
            />
          </View>

          <View style={styles.modalRow}>
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

          <View style={styles.modalRow}>
            <Button mode="outlined" onPress={() => setDraft(null)} style={styles.flex}>
              Болих
            </Button>
            <Button mode="contained" onPress={saveDraft} style={styles.flex}>
              Хадгалах
            </Button>
          </View>
        </Modal>

        <Modal
          visible={renaming !== null}
          onDismiss={() => setRenaming(null)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Ангиллын нэр солих
          </Text>
          <TextInput
            mode="outlined"
            label="Шинэ нэр"
            value={renaming?.to ?? ''}
            onChangeText={(value) =>
              setRenaming((previous) => (previous ? { ...previous, to: value } : previous))
            }
            autoFocus
            dense
          />
          <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
            Энэ ангилалд байгаа бүх үйлчилгээний ангилал шинэчлэгдэнэ.
          </Text>
          <View style={styles.modalRow}>
            <Button mode="outlined" onPress={() => setRenaming(null)} style={styles.flex}>
              Болих
            </Button>
            <Button mode="contained" onPress={applyRename} style={styles.flex}>
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
  list: { paddingBottom: 40 },
  separator: { height: 8 },
  pressed: { opacity: 0.7 },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addLabel: { fontSize: 14, fontWeight: '800' },
  count: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 4,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 20 },
  flex: { flex: 1 },
  index: { fontWeight: '700' },
  name: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  price: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 96,
  },
  chipText: { fontSize: 10, fontWeight: '700' },
  actions: { alignItems: 'center' },
  action: { margin: 0, marginVertical: -2 },

  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 11, lineHeight: 16 },
  modalRow: { flexDirection: 'row', gap: 8 },
});
