import { can, type Capability } from '@/authentication/permissions';
import type { Role } from '@/types';

import type { MainTabParamList } from './types';

/**
 * Per-role tab bars.
 *
 * These arrays are transcribed from the three branches of the web build's tab
 * bar so each role lands on the same set of destinations it had before. Every
 * tab is styled identically — the selected one is what stands out.
 */

export interface TabDefinition {
  name: keyof MainTabParamList;
  label: string;
  icon: string;
}

const WORKER_TABS: TabDefinition[] = [
  { name: 'Home', label: 'Нүүр', icon: 'home-variant' },
  { name: 'Daily', label: 'Дадал', icon: 'calendar-check' },
  { name: 'Chat', label: 'Чат', icon: 'message-text' },
  { name: 'Inventory', label: 'Бараа үнэ', icon: 'package-variant' },
  { name: 'Services', label: 'Хэвлэл үнэ', icon: 'layers' },
];

/**
 * Every destination the shop uses, in the bar.
 *
 * Six is more than a phone bar comfortably holds, so the labels are single
 * words. «Бараа» and «Хэвлэл» are the two price lists and «Санал» the document
 * builder — spelled out they were «Барааны үнэ», «Хэвлэлийн үнэ», «Үнийн
 * санал», which at this width would each clip to something unreadable.
 */
const FULL_TABS: TabDefinition[] = [
  { name: 'Orders', label: 'Захиалга', icon: 'clipboard-list' },
  { name: 'QuickPrint', label: 'Түргэн', icon: 'flash' },
  { name: 'Chat', label: 'Чат', icon: 'message-text' },
  { name: 'Inventory', label: 'Бараа', icon: 'package-variant' },
  { name: 'Services', label: 'Хэвлэл', icon: 'layers' },
  { name: 'Quotation', label: 'Санал', icon: 'file-document-outline' },
];

const IPAD_TABS: TabDefinition[] = FULL_TABS;
const MANAGER_TABS: TabDefinition[] = FULL_TABS;

export const tabsForRole = (role: Role): TabDefinition[] => {
  switch (role) {
    case 'worker':
      return WORKER_TABS;
    case 'ipad':
      return IPAD_TABS;
    default:
      return MANAGER_TABS;
  }
};

/**
 * Capability guarding each tab destination.
 *
 * The tab bar only has room for a handful of icons, but the home shortcuts and
 * the tablet sidebar link to every destination a role may open. Those links
 * fail with "the screen doesn't exist in the navigator" unless the screen is
 * registered, so this map drives a second, hidden set of registrations.
 */
export const TAB_CAPABILITY: Readonly<Record<keyof MainTabParamList, Capability>> = {
  Home: 'viewHome',
  Orders: 'viewOrders',
  Daily: 'viewAttendance',
  QuickPrint: 'viewOrders',
  Quotation: 'viewQuotation',
  Inventory: 'viewInventory',
  Services: 'viewServices',
  Report: 'viewReport',
  Performance: 'viewPerformance',
  Chat: 'viewChat',
};

/**
 * Destinations a role may reach but which are not in its tab bar. They are
 * registered without a tab-bar button so `navigate` works from anywhere.
 */
export const hiddenTabsForRole = (role: Role): (keyof MainTabParamList)[] => {
  const visible = new Set(tabsForRole(role).map((tab) => tab.name));
  return (Object.keys(TAB_CAPABILITY) as (keyof MainTabParamList)[]).filter(
    (name) => !visible.has(name) && can(role, TAB_CAPABILITY[name]),
  );
};

/** Landing tab after login, matching `doLogin`'s default-view branch. */
export const initialTabForRole = (role: Role): keyof MainTabParamList =>
  // The counter opens the app to book something; anything else is a detour.
  role === 'worker' ? 'Inventory' : 'Orders';

/**
 * The full destination list for the tablet sidebar — a superset of the tab bar,
 * including screens that live on the root stack.
 */
export interface SidebarItem {
  key: string;
  label: string;
  icon: string;
  roles: Role[];
  /** Root-stack destinations rather than tabs. */
  stack?: 'Quotation' | 'Admin' | 'Settings';
  tab?: keyof MainTabParamList;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'home', label: 'Нүүр', icon: 'home-variant', roles: ['manager', 'ipad'], tab: 'Home' },
  {
    key: 'orders',
    label: 'Захиалга',
    icon: 'clipboard-list',
    roles: ['manager', 'ipad'],
    tab: 'Orders',
  },
  {
    key: 'quickprint',
    label: 'Түргэн хэвлэл',
    icon: 'flash',
    roles: ['manager', 'ipad'],
    tab: 'QuickPrint',
  },
  {
    key: 'daily',
    label: 'Цаг & Дадал',
    icon: 'calendar-check',
    roles: ['manager', 'ipad', 'worker'],
    tab: 'Daily',
  },
  {
    key: 'inventory',
    label: 'Барааны үнэ',
    icon: 'package-variant',
    roles: ['manager', 'ipad', 'worker'],
    tab: 'Inventory',
  },
  {
    key: 'services',
    label: 'Хэвлэлийн үнэ',
    icon: 'layers',
    roles: ['manager', 'ipad', 'worker'],
    tab: 'Services',
  },
  {
    key: 'performance',
    label: 'Үзүүлэлт',
    icon: 'trending-up',
    roles: ['manager', 'ipad'],
    tab: 'Performance',
  },
  {
    key: 'report',
    label: 'Тайлан',
    icon: 'format-list-bulleted',
    roles: ['manager', 'ipad'],
    tab: 'Report',
  },
  {
    key: 'quotation',
    label: 'Үнийн санал',
    icon: 'file-document-outline',
    roles: ['manager', 'ipad'],
    stack: 'Quotation',
  },
  {
    key: 'admin',
    label: 'Админ',
    icon: 'cog',
    roles: ['manager', 'ipad'],
    stack: 'Admin',
  },
  {
    key: 'chat',
    label: 'Дотоод чат',
    icon: 'message-text',
    roles: ['manager', 'ipad', 'worker'],
    tab: 'Chat',
  },
];
