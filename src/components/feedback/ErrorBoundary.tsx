import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import { reportError } from '@/services/monitoring/crashReporter';
import { logger } from '@/utils/logger';

/**
 * Top-level crash guard.
 *
 * Without this a render error anywhere unmounts the whole tree and the user
 * sees a white screen with no way back. Here they get a message and a reset.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(`Unhandled render error: ${error.message}`, error);
    reportError('render', info.componentStack ?? error);
  }

  private readonly reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.emoji}>😵</Text>
        <Text style={styles.title}>Апп-д алдаа гарлаа</Text>
        <Text style={styles.message}>{error.message}</Text>
        <Button mode="contained" onPress={this.reset} style={styles.button}>
          Дахин эхлүүлэх
        </Button>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    backgroundColor: '#0f172a',
  },
  emoji: { fontSize: 44 },
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '800' },
  message: { color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  button: { marginTop: 16 },
});
