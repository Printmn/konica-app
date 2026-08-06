import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/authentication/AuthContext';
import { useChat } from '@/features/chat/ChatContext';
import { useResponsive } from '@/hooks/useResponsive';
import { ChatScreen } from '@/screens/chat/ChatScreen';
import { DailyScreen } from '@/screens/daily/DailyScreen';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { InventoryScreen } from '@/screens/inventory/InventoryScreen';
import { OrdersScreen } from '@/screens/orders/OrdersScreen';
import { PerformanceScreen } from '@/screens/performance/PerformanceScreen';
import { QuickPrintScreen } from '@/screens/quickprint/QuickPrintScreen';
import { ReportScreen } from '@/screens/report/ReportScreen';
import { ServicesScreen } from '@/screens/services/ServicesScreen';
import { useAppTheme } from '@/theme/ThemeProvider';

import {
  hiddenTabsForRole,
  initialTabForRole,
  tabsForRole,
  type TabDefinition,
} from './tabConfig';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Every screen takes its params from `useRoute`, so they are prop-less and
// assignable to React Navigation's `ScreenComponentType` without a cast.
const SCREENS: Record<keyof MainTabParamList, React.ComponentType> = {
  Home: HomeScreen,
  Orders: OrdersScreen,
  Daily: DailyScreen,
  QuickPrint: QuickPrintScreen,
  Inventory: InventoryScreen,
  Services: ServicesScreen,
  Report: ReportScreen,
  Performance: PerformanceScreen,
  Chat: ChatScreen,
};

/** Selected tab colour — the raised green "Захиалга" button is gone, so green
 * now marks the active destination instead of one privileged one. */
const ACTIVE_GREEN = '#16a34a';

/**
 * Bottom tabs, filtered by role.
 *
 * Only the destinations a role is allowed to see are registered at all, so an
 * unauthorised screen is unreachable rather than merely hidden.
 */
export function MainTabs(): React.JSX.Element {
  const theme = useAppTheme();
  const { role } = useAuth();
  const { isTablet } = useResponsive();
  const { unreadCount } = useChat();
  const insets = useSafeAreaInsets();

  /**
   * The bar is lifted clear of the bottom edge and given room to breathe.
   *
   * Sitting flush against the edge put the icons within a few pixels of the
   * home indicator, where a thumb reaching for "Нүүр" would swipe the app away
   * instead. Raising it, growing the row and padding each item turns a cramped
   * strip into targets comfortably over the ~44pt minimum.
   */
  const barLift = Math.max(insets.bottom, 10);
  const barHeight = (isTablet ? 76 : 68) + barLift;

  const tabs: TabDefinition[] = useMemo(
    () => (role ? tabsForRole(role) : []),
    [role],
  );

  // Reachable by shortcut or sidebar, but not shown in the bar.
  const hidden = useMemo(() => (role ? hiddenTabsForRole(role) : []), [role]);

  const initialRouteName = role ? initialTabForRole(role) : 'Home';

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        // The bar has nothing to offer while someone is typing, and leaving it
        // on stacks its height on top of the keyboard — which is what pushed
        // the chat composer out of sight.
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: ACTIVE_GREEN,
        tabBarInactiveTintColor: theme.custom.mutedText,
        tabBarStyle: {
          backgroundColor: theme.custom.cardBackground,
          borderTopColor: theme.custom.subtleBorder,
          height: barHeight,
          paddingTop: 10,
          paddingBottom: barLift,
          paddingHorizontal: 4,
          // Rounded top edge plus a shadow reads as a raised surface rather
          // than part of the screen behind it.
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: '#0f172a',
          shadowOpacity: 0.1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.tabIcon,
        // Tabs are cheap to keep alive and the shop switches between them
        // constantly; unmounting would drop scroll position and form drafts.
        lazy: true,
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={SCREENS[tab.name]}
          options={{
            title: tab.label,
            // Every tab renders identically; the selected one is a touch
            // larger and green so it reads without a colour legend.
            tabBarIcon: ({ color, focused }) => (
              <Icon source={tab.icon} size={focused ? 30 : 26} color={color} />
            ),
            // Unread messages are the one thing worth interrupting another
            // screen for, so the count rides on the Chat tab.
            ...(tab.name === 'Chat' && unreadCount > 0
              ? { tabBarBadge: unreadCount > 99 ? '99+' : unreadCount }
              : {}),
            tabBarLabel: ({ color, focused }) => (
              <Text
                style={[styles.tabLabel, focused && styles.tabLabelActive, { color }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            ),
          }}
        />
      ))}

      {hidden.map((name) => (
        <Tab.Screen
          key={name}
          name={name}
          component={SCREENS[name]}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: styles.hiddenTab,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  hiddenTab: { display: 'none' },
  // Each item owns its full share of the row, so the tap area is the whole
  // column rather than just the glyph.
  tabItem: { paddingVertical: 4, borderRadius: 16 },
  tabIcon: { marginTop: 2 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tabLabelActive: { fontSize: 12, fontWeight: '800', marginTop: 2 },
});
