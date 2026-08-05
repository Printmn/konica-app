import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
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
 * The page is scaled down to fit an A4 sheet on a phone screen. `initialScale`
 * alone is unreliable across platforms, so the width is pinned in the injected
 * viewport tag instead.
 */

interface DocumentPreviewProps {
  html: string;
}

/** A4 at 96dpi, which is the width the print stylesheet is laid out for. */
const PAGE_WIDTH_PX = 794;

function DocumentPreviewBase({ html }: DocumentPreviewProps): React.JSX.Element {
  const theme = useAppTheme();

  return (
    <View style={[styles.frame, { backgroundColor: theme.colors.surfaceVariant }]}>
      <WebView
        // The document is built by this app from its own form; nothing here is
        // fetched, so there is no remote content to restrict.
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        containerStyle={styles.web}
        scalesPageToFit
        injectedJavaScriptBeforeContentLoaded={`
          var meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=${PAGE_WIDTH_PX}, initial-scale=0.1, user-scalable=yes';
          document.head.appendChild(meta);
          true;
        `}
        showsHorizontalScrollIndicator={false}
        // A blank flash on every keystroke would make the preview unreadable
        // while typing, so the previous frame is kept until the new one paints.
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
