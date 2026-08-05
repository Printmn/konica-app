import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavLightTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';

import { useAuth } from '@/authentication/AuthContext';
import { LoadingState } from '@/components/feedback/StateViews';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { PinSetupScreen } from '@/screens/auth/PinSetupScreen';
import { ImageViewerScreen } from '@/screens/home/ImageViewerScreen';
import { QuotationScreen } from '@/screens/quotation/QuotationScreen';
import { SettingsScreen } from '@/screens/admin/SettingsScreen';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useThemeMode } from '@/theme/ThemeProvider';

import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root navigator.
 *
 * Login is a separate branch of the tree rather than a conditional render, so
 * logging out cannot leave an authenticated screen mounted underneath — the
 * whole authenticated stack is torn down.
 */
export function RootNavigator(): React.JSX.Element {
  const { session, isRestoring, needsPinSetup } = useAuth();
  const theme = useAppTheme();
  const { isDark } = useThemeMode();

  const navTheme = useMemo<NavTheme>(() => {
    const base = isDark ? NavDarkTheme : NavLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.custom.screenBackground,
        card: theme.custom.cardBackground,
        text: theme.colors.onSurface,
        border: theme.custom.subtleBorder,
      },
    };
  }, [isDark, theme]);

  if (isRestoring) return <LoadingState label="Нэвтрэлт шалгаж байна..." />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {needsPinSetup ? (
          <Stack.Screen name="PinSetup" component={PinSetupScreen} />
        ) : session === null ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="Quotation"
              component={QuotationScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Admin"
              component={AdminScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ImageViewer"
              component={ImageViewerScreen}
              options={{ animation: 'fade', presentation: 'transparentModal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
