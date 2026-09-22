import type { NavigatorScreenParams } from '@react-navigation/native';

import type { DocType, QuotationPrefill, WorkLogPrefill } from '@/types';

/**
 * Navigation contracts.
 *
 * The web build kept a single `currentView` string and passed data between
 * views through lifted state (`quotationPrefill`, `mkvPrefill`). Those handoffs
 * are now typed route params, so a screen cannot be reached without the data it
 * needs and the compiler enforces it.
 */

export type MainTabParamList = {
  Home: undefined;
  Orders: { prefill?: WorkLogPrefill } | undefined;
  Daily: undefined;
  QuickPrint: undefined;
  Quotation: { prefill?: QuotationPrefill; docType?: DocType } | undefined;
  Inventory: undefined;
  Services: undefined;
  Report: undefined;
  Performance: undefined;
  Staff: undefined;
  Profile: undefined;
  Usage: undefined;
  Chat: undefined;
  Notices: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  /** Shown once, on a fresh install, before any PIN exists. */
  PinSetup: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  Admin: undefined;
  Settings: undefined;
  ImageViewer: { uri: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // Empty on purpose: this is module augmentation, which is what makes
    // `navigation.navigate` type-check against our routes app-wide.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
