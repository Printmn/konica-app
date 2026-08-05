import { Image } from 'expo-image';
import React, { memo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon } from 'react-native-paper';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A catalog photo, opened large enough to actually see.
 *
 * The list thumbnails are 46pt — enough to tell two products apart, not enough
 * to read what is printed on one. Tapping one opens it here, at a size that
 * fills the middle of the screen without going edge to edge: photos are stored
 * compressed to 400px, so blowing one up to full screen just shows the
 * compression.
 *
 * This uses React Native's own `Modal` rather than Paper's. Paper's version
 * imposes its own layout on the container, which fought the centring here and
 * pinned the card to the top of the screen with its close button off-screen.
 * The platform modal hands over a plain full-screen surface, so the backdrop
 * can simply centre its child.
 *
 * Anywhere outside the picture closes it, which is what people try first, and
 * the corner ✕ is there for everyone else.
 */

interface ImageLightboxProps {
  /** The image to show, or `null` when nothing is open. */
  uri: string | null;
  /** Shown under the picture, so it is clear which product this is. */
  title?: string;
  subtitle?: string;
  onDismiss: () => void;
}

/** Of the shorter screen dimension. Leaves the picture clearly framed. */
const SIZE_RATIO = 0.62;
const MAX_SIZE = 340;

function ImageLightboxBase({
  uri,
  title = '',
  subtitle = '',
  onDismiss,
}: ImageLightboxProps): React.JSX.Element {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const size = Math.min(Math.min(width, height) * SIZE_RATIO, MAX_SIZE);

  return (
    <Modal
      visible={uri !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android's back button has to close this, or it closes the screen behind.
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Хаах"
      >
        {/* Swallows taps on the card so they do not reach the backdrop. */}
        <Pressable
          onPress={() => undefined}
          style={[styles.card, { backgroundColor: theme.custom.cardBackground }]}
        >
          <View style={styles.cardHead}>
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Хаах"
              style={[styles.close, { backgroundColor: theme.colors.surfaceVariant }]}
            >
              <Icon source="close" size={20} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          {uri === null ? null : (
            <Image
              source={{ uri }}
              style={{ width: size, height: size, borderRadius: 14 }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
            />
          )}

          {title === '' ? null : (
            <Text
              style={[styles.title, { color: theme.colors.onSurface, maxWidth: size }]}
              numberOfLines={2}
            >
              {title}
            </Text>
          )}
          {subtitle === '' ? null : (
            <Text style={[styles.subtitle, { color: theme.colors.primary }]}>{subtitle}</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: { borderRadius: 20, padding: 12, gap: 8, alignItems: 'center' },
  // A row of its own rather than an absolute overlay: floating the button over
  // the picture is what put it off the top edge in the first place.
  cardHead: { alignSelf: 'stretch', alignItems: 'flex-end' },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, fontWeight: '900' },
});

export const ImageLightbox = memo(ImageLightboxBase);
