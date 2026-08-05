import { Image } from 'expo-image';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isLowStock, isOutOfStock, stockCount } from '@/features/inventory/inventoryLogic';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { InventoryItem, ServiceItem } from '@/types';

/**
 * One row in the inventory / services price lists.
 *
 * `expo-image` handles the base64 thumbnails with a memory + disk cache, so
 * scrolling a 120-row catalog does not re-decode the same JPEG repeatedly.
 * Rows are memoised because the list re-renders on every sync tick.
 */

interface CatalogRowProps {
  item: InventoryItem | ServiceItem;
  emoji: string;
  onPress?: (() => void) | undefined;
  onLongPress?: (() => void) | undefined;
  /** Inventory rows show a stock badge; service rows do not. */
  showStock?: boolean;
  /**
   * Tapping the photo opens it large instead of opening the edit form. Only
   * wired up where there is a photo to open — a row without one keeps the
   * whole surface as a single tap target.
   */
  onPressImage?: (() => void) | undefined;
}

const hasStock = (item: InventoryItem | ServiceItem): item is InventoryItem =>
  'stock' in item;

function CatalogRowBase({
  item,
  emoji,
  onPress,
  onLongPress,
  showStock = false,
  onPressImage,
}: CatalogRowProps): React.JSX.Element {
  const theme = useAppTheme();
  const stockItem = hasStock(item) ? item : null;

  const stockTint = stockItem
    ? isOutOfStock(stockItem)
      ? '#dc2626'
      : isLowStock(stockItem)
        ? '#f59e0b'
        : '#16a34a'
    : theme.custom.mutedText;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.subtleBorder,
        },
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <Pressable
        onPress={item.image && onPressImage ? onPressImage : onPress}
        accessibilityRole="button"
        accessibilityLabel={item.image ? `${item.name} зураг харах` : item.name}
        style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}
      >
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
      </Pressable>

      <View style={styles.body}>
        <Text
          style={[styles.name, { color: theme.colors.onSurface }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <Text style={[styles.category, { color: theme.custom.mutedText }]} numberOfLines={1}>
          {item.category}
        </Text>
      </View>

      <View style={styles.trailing}>
        <Text style={[styles.price, { color: theme.colors.primary }]}>{item.price}</Text>
        {showStock && stockItem ? (
          <Text style={[styles.stock, { color: stockTint }]}>
            {isOutOfStock(stockItem) ? 'Дууссан' : `${stockCount(stockItem)} ш`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  emoji: { fontSize: 22 },
  body: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  category: { fontSize: 10, fontWeight: '600' },
  trailing: { alignItems: 'flex-end', gap: 2 },
  price: { fontSize: 13, fontWeight: '900' },
  stock: { fontSize: 10, fontWeight: '800' },
});

export const CatalogRow = memo(CatalogRowBase);
