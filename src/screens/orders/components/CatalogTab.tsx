import React, { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, Modal, Portal, SegmentedButtons, TextInput } from 'react-native-paper';

import { EmptyState } from '@/components/feedback/StateViews';
import { SearchBar } from '@/components/ui/SearchBar';
import { getServiceEmoji } from '@/constants/emoji';
import { CUSTOM_PRICE_CATEGORIES } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { PayType, ServiceItem } from '@/types';
import { formatCurrency, parsePrice } from '@/utils/price';

/**
 * Catalog → quick order.
 *
 * One flat, numbered list, laid out exactly like the Хэвлэлийн үнэ screen so
 * staff learn a single list rather than two. The difference is what a tap does:
 * here it opens a quantity sheet and books the job, rather than editing the
 * price. Rows in `CUSTOM_PRICE_CATEGORIES` (medals, apparel) open the
 * free-price sheet instead, because those are always negotiated per job.
 */

const PAY_TYPES: PayType[] = ['Данс', 'Бэлэн', 'Карт'];

/**
 * These three cover most of the counter's daily volume, so they always lead
 * the chip row — regardless of how many rows each currently has — with
 * whatever else is in the catalog trailing behind, busiest first.
 */
const PRIORITY_CATEGORIES = ['Канон', 'Цээж зураг', 'Хэвлэл'];

export interface QuickOrderDraft {
  description: string;
  unitPrice: number;
  quantity: number;
  payType: PayType;
}

interface CatalogTabProps {
  services: readonly ServiceItem[];
  onConfirm: (draft: QuickOrderDraft) => void;
}

function CatalogTabBase({ services, onConfirm }: CatalogTabProps): React.JSX.Element {
  const theme = useAppTheme();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  /** `null` = «Бүгд» — every category shown. */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  /** What the negotiated-price sheet is about — a service name or a category. */
  const [customFor, setCustomFor] = useState('');

  const [quantity, setQuantity] = useState('1');
  const [payType, setPayType] = useState<PayType>('Данс');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  /**
   * Category chips — «Канон», «Цээж зураг», «Хэвлэл» гэх мэт.
   *
   * Хатуу жагсаалт биш, `services`-ээс өөрөө гардаг: хамгийн олон мөртэй
   * ангилал эхэнд гарч ирнэ, тул дэлгүүр нэмж/устгаж ангилсан ч чип-ийн
   * жагсаалт дагаад шинэчлэгдэнэ.
   */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of services) {
      const category = service.category || 'Бусад';
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const front = PRIORITY_CATEGORIES.filter((name) => counts.has(name));
    const rest = Array.from(counts.entries())
      .filter(([name]) => !PRIORITY_CATEGORIES.includes(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    return [...front, ...rest];
  }, [services]);

  /** Matches the price list: one flat, numbered list, searchable by category. */
  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return services.filter((service) => {
      if (categoryFilter && (service.category || 'Бусад') !== categoryFilter) return false;
      if (!needle) return true;
      return (
        service.name.toLowerCase().includes(needle) ||
        (service.category || '').toLowerCase().includes(needle)
      );
    });
  }, [services, debouncedSearch, categoryFilter]);

  const isNegotiated = (service: ServiceItem): boolean =>
    (CUSTOM_PRICE_CATEGORIES as readonly string[]).includes(service.category);

  const closeSheets = (): void => {
    setSelected(null);
    setCustomOpen(false);
    setCustomFor('');
    setQuantity('1');
    setPayType('Данс');
    setCustomDesc('');
    setCustomPrice('');
  };

  /**
   * Medals and apparel are always priced per job, so tapping one opens the
   * free-price sheet instead of the fixed one — the same rule the folder view
   * applied to a whole category, now decided per row.
   */
  const openFor = (service: ServiceItem): void => {
    setQuantity('1');
    if (isNegotiated(service)) {
      setCustomFor(service.name);
      setCustomDesc(service.name);
      setCustomPrice('');
      setCustomOpen(true);
      return;
    }
    setSelected(service);
  };

  const confirmFixed = (): void => {
    if (!selected) return;
    onConfirm({
      description: selected.name,
      unitPrice: parsePrice(selected.price),
      quantity: Math.max(1, Number(quantity) || 1),
      payType,
    });
    closeSheets();
  };

  const confirmCustom = (): void => {
    const unitPrice = parsePrice(customPrice);
    if (unitPrice <= 0) return;
    onConfirm({
      description: customDesc.trim() || customFor || 'Тохиролцоо',
      unitPrice,
      quantity: Math.max(1, Number(quantity) || 1),
      payType,
    });
    closeSheets();
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Үйлчилгээ, ангиллаар хайх..."
            />

            {categories.length > 1 ? (
              <FlatList
                data={categories}
                keyExtractor={(item) => item}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
                ItemSeparatorComponent={() => <View style={styles.categorySeparator} />}
                ListHeaderComponent={
                  <Pressable
                    onPress={() => setCategoryFilter(null)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: categoryFilter === null }}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor:
                          categoryFilter === null
                            ? theme.colors.primary
                            : theme.custom.cardBackground,
                        borderColor:
                          categoryFilter === null ? theme.colors.primary : theme.custom.subtleBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color:
                            categoryFilter === null ? theme.colors.onPrimary : theme.colors.onSurface,
                        },
                      ]}
                    >
                      Бүгд
                    </Text>
                  </Pressable>
                }
                renderItem={({ item }) => {
                  const active = categoryFilter === item;
                  return (
                    <Pressable
                      onPress={() => setCategoryFilter(active ? null : item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: active ? theme.colors.primary : theme.custom.cardBackground,
                          borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            ) : null}

            <Pressable
              onPress={() => {
                setCustomFor('');
                setCustomDesc('');
                setCustomPrice('');
                setQuantity('1');
                setCustomOpen(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.customButton,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.custom.cardBackground,
                },
                pressed && styles.pressed,
              ]}
            >
              <Icon source="cash-plus" size={20} color={theme.colors.primary} />
              <Text style={[styles.customLabel, { color: theme.colors.primary }]}>
                Тохиролцоо — дурын үнэ
              </Text>
            </Pressable>

            <Text style={[styles.count, { color: theme.custom.mutedText }]}>
              {debouncedSearch || categoryFilter
                ? `ОЛДСОН ${visible.length} ҮЙЛЧИЛГЭЭ`
                : `НИЙТ ${visible.length} ҮЙЛЧИЛГЭЭ`}
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🔍" title="Илэрц олдсонгүй" />}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => openFor(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.price}`}
            style={({ pressed }) => [
              styles.serviceRow,
              {
                backgroundColor: theme.custom.cardBackground,
                borderColor: theme.custom.subtleBorder,
              },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={styles.thumbEmoji}>
                {getServiceEmoji(item.name, item.category)}
              </Text>
            </View>

            <View style={styles.flex}>
              <Text
                style={[styles.serviceName, { color: theme.colors.onSurface }]}
                numberOfLines={2}
              >
                <Text style={[styles.index, { color: theme.custom.mutedText }]}>
                  {index + 1}.{' '}
                </Text>
                {item.name}
              </Text>
              <Text style={[styles.servicePrice, { color: theme.colors.primary }]}>
                {isNegotiated(item) ? 'Тохиролцоно' : item.price}
              </Text>
            </View>

            {item.category ? (
              <Text
                style={[
                  styles.chip,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    color: theme.custom.mutedText,
                  },
                ]}
                numberOfLines={1}
              >
                {item.category}
              </Text>
            ) : null}

            <Icon source="chevron-right" size={20} color={theme.custom.mutedText} />
          </Pressable>
        )}
      />

      {/* Fixed-price sheet */}
      <Portal>
        <Modal
          visible={selected !== null}
          onDismiss={closeSheets}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.sheetTitle, { color: theme.colors.onSurface }]}>
            {selected?.name}
          </Text>
          <Text style={[styles.sheetPrice, { color: theme.colors.primary }]}>
            {selected?.price}
          </Text>

          <TextInput
            mode="outlined"
            label="Тоо ширхэг"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            dense
          />

          <SegmentedButtons
            value={payType}
            onValueChange={(value) => setPayType(value)}
            density="small"
            buttons={PAY_TYPES.map((type) => ({ value: type, label: type }))}
          />

          <View style={[styles.sheetTotal, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.sheetTotalLabel, { color: theme.colors.onPrimaryContainer }]}>
              Нийт
            </Text>
            <Text style={[styles.sheetTotalValue, { color: theme.colors.onPrimaryContainer }]}>
              {formatCurrency(
                parsePrice(selected?.price ?? '') * Math.max(1, Number(quantity) || 1),
              )}
            </Text>
          </View>

          <View style={styles.sheetActions}>
            <Button mode="outlined" onPress={closeSheets} style={styles.flex}>
              Болих
            </Button>
            <Button mode="contained" onPress={confirmFixed} style={styles.flex}>
              Бүртгэх
            </Button>
          </View>
        </Modal>

        {/* Negotiated-price sheet */}
        <Modal
          visible={customOpen}
          onDismiss={closeSheets}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.sheetTitle, { color: theme.colors.onSurface }]}>
            {customFor ? `Тохиролцоо — ${customFor}` : 'Тохиролцоо — дурын үнэ'}
          </Text>

          <TextInput
            mode="outlined"
            label="Тайлбар"
            value={customDesc}
            onChangeText={setCustomDesc}
            placeholder={customFor || 'Тайлбар'}
            dense
          />
          <TextInput
            mode="outlined"
            label="Нэгж үнэ"
            value={customPrice}
            onChangeText={setCustomPrice}
            keyboardType="number-pad"
            dense
          />
          <TextInput
            mode="outlined"
            label="Тоо ширхэг"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            dense
          />

          <SegmentedButtons
            value={payType}
            onValueChange={(value) => setPayType(value)}
            density="small"
            buttons={PAY_TYPES.map((type) => ({ value: type, label: type }))}
          />

          <View style={[styles.sheetTotal, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.sheetTotalLabel, { color: theme.colors.onPrimaryContainer }]}>
              Нийт
            </Text>
            <Text style={[styles.sheetTotalValue, { color: theme.colors.onPrimaryContainer }]}>
              {formatCurrency(parsePrice(customPrice) * Math.max(1, Number(quantity) || 1))}
            </Text>
          </View>

          <View style={styles.sheetActions}>
            <Button mode="outlined" onPress={closeSheets} style={styles.flex}>
              Болих
            </Button>
            <Button
              mode="contained"
              onPress={confirmCustom}
              disabled={parsePrice(customPrice) <= 0}
              style={styles.flex}
            >
              Бүртгэх
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  list: { paddingBottom: 24 },
  separator: { height: 8 },

  // Deliberately identical to the Хэвлэлийн үнэ rows.
  header: { paddingBottom: 10, gap: 10 },
  categoryRow: { paddingVertical: 2 },
  categorySeparator: { width: 8 },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryChipText: { fontSize: 12, fontWeight: '700' },
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
  },
  customLabel: { fontSize: 14, fontWeight: '800' },
  count: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: { fontSize: 20 },
  index: { fontWeight: '700' },
  serviceName: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  servicePrice: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  chip: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    maxWidth: 96,
  },
  sheet: { margin: 16, borderRadius: 20, padding: 16, gap: 10 },
  sheetTitle: { fontSize: 15, fontWeight: '800' },
  sheetPrice: { fontSize: 20, fontWeight: '900' },
  sheetTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  sheetTotalLabel: { fontSize: 12, fontWeight: '700' },
  sheetTotalValue: { fontSize: 16, fontWeight: '900' },
  sheetActions: { flexDirection: 'row', gap: 8 },
});

export const CatalogTab = memo(CatalogTabBase);
