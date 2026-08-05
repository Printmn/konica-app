import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/authentication/AuthContext';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ChatProvider } from '@/features/chat/ChatContext';
import { DataProvider } from '@/features/data/DataContext';
import { ToastProvider } from '@/hooks/useToast';
import { RootNavigator } from '@/navigation/RootNavigator';
import { initNotifications } from '@/services/notifications/notificationService';
import { autoBackupIfDue } from '@/services/sync/backupService';
import { checkForUpdate } from '@/services/sync/updateService';
import { refreshConnectivity } from '@/services/network/connectivity';
import { AppThemeProvider, useThemeMode } from '@/theme/ThemeProvider';

/**
 * Application root.
 *
 * Provider order is deliberate:
 *   GestureHandler → SafeArea → Theme → Toast → Data → Auth → Chat → Navigation
 *
 * `Data` sits above `Auth` because the login screen needs the employee roster
 * to resolve a worker's PIN before any session exists. `Chat` sits above the
 * navigator so its unread badge and notifications keep working no matter which
 * screen is open.
 */

void SplashScreen.preventAutoHideAsync();

function ThemedStatusBar(): React.JSX.Element {
  const { isDark } = useThemeMode();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    void (async () => {
      await Promise.all([refreshConnectivity(), initNotifications()]);
      await SplashScreen.hideAsync();
      // Both run after the splash so neither delays the first paint.
      void checkForUpdate();
      void autoBackupIfDue();
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AppThemeProvider>
            <ThemedStatusBar />
            <ToastProvider>
              <DataProvider>
                <AuthProvider>
                  <ChatProvider>
                    <RootNavigator />
                  </ChatProvider>
                </AuthProvider>
              </DataProvider>
            </ToastProvider>
          </AppThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
