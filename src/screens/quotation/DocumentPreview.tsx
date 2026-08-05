import React, { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Live preview of the printed document.
 *
 * The same HTML that expo-print turns into the PDF is rendered here in a
 * WebView, so what the clerk sees is the document itself rather than a second
 * layout that would drift away from it over time. Nothing is written to disk —
 * the markup is handed to the view directly.
 *
 * Fitting an A4 page onto a phone is done by rewriting the page's own viewport
 * tag before handing it over, with a scale worked out from the screen width.
 * The first version injected that tag with JavaScript instead, and it worked in
 * development but not in a release build: the injection runs before the
 * document is parsed, so `document.head` is not always there to append to, and
 * when it is missed the page falls back to a fixed zoom and renders postage
 * stamp sized. Rewriting the string has no timing to get wrong.
 */

interface DocumentPreviewProps {
  html: string;
}

/** A4 at 96dpi, which is the width the print stylesheet is laid out for. */
const PAGE_WIDTH_PX = 794;

/** Breathing room either side of the sheet, in screen points. */
const FRAME_PADDING = 8;

function DocumentPreviewBase({ html }: DocumentPreviewProps): React.JSX.Element {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();

  const source = useMemo(() => {
    // Never zoom past 1:1 — on a tablet the sheet should sit at full size
    // rather than being blown up past the resolution it was laid out at.
    const scale = Math.min(1, (width - FRAME_PADDING * 2) / PAGE_WIDTH_PX);
    const viewport =
      `<meta name="viewport" content="width=${PAGE_WIDTH_PX}, ` +
      `initial-scale=${scale.toFixed(3)}, minimum-scale=${scale.toFixed(3)}, ` +
      `maximum-scale=3, user-scalable=yes" />`;

    const existing = /<meta\s+name="viewport"[^>]*>/i;
    return {
      html: existing.test(html)
        ? html.replace(existing, viewport)
        : html.replace(/<head>/i, `<head>${viewport}`),
    };
  }, [html, width]);

  return (
    <View style={[styles.frame, { backgroundColor: theme.colors.surfaceVariant }]}>
      <WebView
        // The document is built by this app from its own form; nothing here is
        // fetched, so there is no remote content to restrict.
        originWhitelist={['*']}
        source={source}
        style={styles.web}
        containerStyle={styles.web}
        // The viewport tag above already sets the scale; letting Android also
        // fit the page fights it and lands somewhere between the two.
        scalesPageToFit={false}
        showsHorizontalScrollIndicator={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
});

export const DocumentPreview = memo(DocumentPreviewBase);
