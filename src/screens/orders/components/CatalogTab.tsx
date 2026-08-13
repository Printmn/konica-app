import React, { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, Modal, Portal, SegmentedButtons, TextInput } from 'react-native-paper';

import { EmptyState } from '@/components/feedback/StateViews';
import { SearchBar } from '@/components/ui/SearchBar';
import { TimeField } from '@/components/ui/TimeField';
import { getServiceEmoji } from '@/constants/emoji';
import { CUSTOM_PRICE_CATEGORIES } from '@/constants/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { PayType, ServiceItem } from '@/types';
import { nowTimeString } from '@/utils/date';
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
 * The only three chips the counter gets.
 *
 * The row used to list every category in the catalog, busiest first, which on
 * a phone ran off the right edge and turned a filter into a search. These three
 * are the day's real volume; everything else is still reachable through «Бүгд»
 * and the search box.
 */
const PRIORITY_CATEGORIES = ['Цээж зураг', 'Канон', 'Хэвлэл'];

export interface QuickOrderDraft {
  description: string;
  unitPrice: number;
  quantity: number;
  payType: PayType;
  /** `HH:MM`, filled in from the clock when the sheet opens. */
  receivedTime: string;
}

interface CatalogTabProps {
  services: readonly ServiceItem[];
  onConfirm: (draft: QuickOrderDraft) => void;
}

function CatalogTabBase({ services, onConfirm }: CatalogTabProps): React.JSX.Element {
  const theme = useAppTheme();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  /** `null` until a chip is tapped, when the first category is in force. */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  /** What the negotiated-price sheet is about — a service name or a category. */
  const [customFor, setCustomFor] = useState('');

  const [quantity, setQuantity] = useState('1');
  /**
   * When the job came in. Read off the clock the moment a sheet opens, so the
   * common case needs no attention at all — it is only there to be corrected
   * when the counter books a sale late.
   */
  const [receivedTime, setReceivedTime] = useState(() => nowTimeString());
  const [payType, setPayType] = useState<PayType>('Данс');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  /**
   * Everything this screen will ever show.
   *
   * The quick screen is the counter's three fast-moving lines — Цээж зураг,
   * Канон, Хэвлэл. The full catalog stays on Хэвлэлийн үнэ. Narrowing once
   * here also keeps the search box from turning up rows that have no chip to
   * sit under.
   */
  const catalog = useMemo(
    () => services.filter((service) => PRIORITY_CATEGORIES.includes(service.category || 'Бусад')),
    [services],
  );

  /** Only the three, and only those the catalog actually has rows for. */
  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const service of catalog) present.add(service.category || 'Бусад');
    return PRIORITY_CATEGORIES.filter((name) => present.has(name));
  }, [catalog]);

  /**
   * With «Бүгд» gone one category is always in force, so an untouched screen
   * falls back to the first chip rather than showing nothing.
   */
  const activeCategory = categoryFilter ?? categories[0] ?? null;

  /** Matches the price list: one flat, numbered list, searchable by category. */
  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return catalog.filter((service) => {
      if (activeCategory && (service.category || 'Бусад') !== activeCategory) return false;
      if (!needle) return true;
      return (
        service.name.toLowerCase().includes(needle) ||
        (service.category || '').toLowerCase().includes(needle)
      );
    });
  }, [catalog, debouncedSearch, activeCategory]);

  const isNegotiated = (service: ServiceItem): boolean =>
    (CUSTOM_PRICE_CATEGORIES as readonly string[]).includes(service.category);

  const closeSheets = (): void => {
    setSelected(null);
    setCustomOpen(false);
    setCustomFor('');
    setQuantity('1');
    setReceivedTime(nowTimeString());
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
    setReceivedTime(nowTimeString());
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
      receivedTime,
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
      receivedTime,
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

            {/* Three buttons, centred, and no «Бүгд». The counter works out of
                one category at a time; an all-categories view only ever meant
                scrolling past work this screen does not do. */}
            {categories.length > 0 ? (
              <View style={styles.categoryRow}>
                {categories.map((item) => {
                  const active = activeCategory === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setCategoryFilter(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: active
                            ? theme.custom.selected
                            : theme.custom.cardBackground,
                          borderColor: active
                            ? theme.custom.selected
                            : theme.custom.subtleBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: active ? theme.custom.onSelected : theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* «Тохиролцоо — дурын үнэ» stood here. The same negotiated price
                is set from the order form, and a second way in from the quick
                screen only meant two places to look. Rows in
                `CUSTOM_PRICE_CATEGORIES` still open the free-price sheet when
                tapped, so nothing is unreachable. */}
            <Text style={[styles.count, { color: theme.custom.mutedText }]}>
              {debouncedSearch
                ? `ОЛДСОН ${visible.length} ҮЙЛЧИЛГЭЭ`
                : `${activeCategory ?? ''} · ${visible.length} ҮЙЛЧИЛГЭЭ`}
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

          <View style={styles.timeRow}>
            <Text style={[styles.timeLabel, { color: theme.custom.mutedText }]}>
              📥 Захиалга орсон цаг
            </Text>
            <TimeField
              label=""
              value={receivedTime}
              onChange={setReceivedTime}
              placeholder={nowTimeString()}
            />
          </View>

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

          <View style={styles.timeRow}>
            <Text style={[styles.timeLabel, { color: theme.custom.mutedText }]}>
              📥 Захиалга орсон цаг
            </Text>
            <TimeField
              label=""
              value={receivedTime}
              onChange={setReceivedTime}
              placeholder={nowTimeString()}
            />
          </View>

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
  /**
   * Three chips, so they get the width rather than scrolling. Centred and a
   * size up from the old row — this is the first thing a hand reaches for on
   * the quick screen.
   */
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  categoryChipText: { fontSize: 14, fontWeight: '800' },
  count: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  timeRow: { gap: 6 },
  timeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

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
