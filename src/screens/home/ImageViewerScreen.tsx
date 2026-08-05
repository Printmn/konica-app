import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '@/navigation/types';

/**
 * Full-screen image.
 *
 * Replaces the `position:fixed` lightbox overlay. Tapping the backdrop closes
 * it, matching the original interaction.
 */
export function ImageViewerScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ImageViewer'>>();

  return (
    <Pressable
      style={styles.backdrop}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Хаах"
    >
      <View style={styles.container} pointerEvents="box-none">
        <Image
          source={{ uri: params.uri }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={[styles.close, { top: insets.top + 16 }]}
        accessibilityRole="button"
        accessibilityLabel="Хаах"
      >
        <Icon source="close" size={22} color="#ffffff" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  image: { width: '100%', height: '100%', borderRadius: 12 },
  close: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
