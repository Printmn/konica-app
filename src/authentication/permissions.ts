import type { Role } from '@/types';

/**
 * Role capabilities.
 *
 * The web build scattered `role === 'manager'` checks through the JSX. Every
 * one of those rules is collected here, unchanged, so a screen asks a question
 * (`can(role, 'editCatalog')`) instead of restating policy.
 */

export type Capability =
  | 'viewHome'
  | 'viewOrders'
  | 'viewWorkLogs'
  | 'viewAttendance'
  | 'viewInventory'
  | 'viewServices'
  | 'viewReport'
  | 'viewArchive'
  | 'viewMonthTotals'
  | 'viewPerformance'
  | 'viewQuotation'
  | 'viewAdmin'
  | 'viewChat'
  | 'editCatalog'
  | 'editWorkLogs'
  | 'deleteWorkLogs'
  | 'manageEmployees'
  | 'manageHabits'
  | 'viewScores'
  | 'exportData'
  | 'changeSettings';

const MATRIX: Readonly<Record<Capability, readonly Role[]>> = {
  viewHome: ['manager', 'ipad', 'worker'],
  viewOrders: ['manager', 'ipad'],
  viewWorkLogs: ['manager', 'ipad'],
  viewAttendance: ['manager', 'ipad', 'worker'],
  // The price lists are the shop's, not the staff's. Taking them off the
  // worker role means the screens are never registered for that role at all —
  // hidden tabs would still be reachable by a stray `navigate`.
  viewInventory: ['manager', 'ipad'],
  viewServices: ['manager', 'ipad'],
  /** The report screen: a day's takings, its jobs, and the Excel export. */
  viewReport: ['manager', 'ipad'],
  /**
   * The month's running totals — the САРЫН НЭГТГЭЛ panel.
   *
   * Manager only, where the day is not. A day's takings are something the
   * counter reconciles against the till at closing, so hiding them from the
   * device the till sits next to helps nobody. The month is a different
   * figure: it is the shop's turnover, it is on screen for weeks at a time,
   * and the iPad is left face-up in a public room while somebody fetches a
   * job. One is a tool, the other is an accidental disclosure.
   */
  viewMonthTotals: ['manager'],
  /**
   * Looking a past day's *jobs* up — the archive picker on the board.
   *
   * Separate from `viewReport`, because they are separate questions. «What
   * did we take on the fourth» is the shop's business; «was this customer's
   * banner booked last Tuesday» is the counter's, and it is asked with the
   * customer standing there. Folding the two together took a daily tool off
   * the iPad to hide a figure the archive does not show in the first place.
   */
  viewArchive: ['manager', 'ipad'],
  // Scores and the month's bonus, same rule as `viewScores`.
  viewPerformance: ['manager'],
  viewQuotation: ['manager', 'ipad'],
  viewAdmin: ['manager', 'ipad'],
  viewChat: ['manager', 'ipad', 'worker'],

  // Workers browse the price lists read-only; they cannot mutate the catalog.
  editCatalog: ['manager', 'ipad'],
  editWorkLogs: ['manager', 'ipad'],

  // Booking and correcting a job is counter work; removing one from the record
  // is not. A deleted order takes its money out of the day's takings with it,
  // and nothing in the app can bring it back.
  deleteWorkLogs: ['manager'],
  manageEmployees: ['manager'],
  // Habits and their point values are the manager's to set: they decide what
  // a month's bonus comes to, and the counter iPad is a shared device anybody
  // in the shop can pick up.
  manageHabits: ['manager'],
  /**
   * Seeing the points and the money they add up to.
   *
   * Staff still tick their habits — the ticking is the record — but the score
   * and the bonus are the manager's to read. A running total on a shared shop
   * floor turns a quiet measure into a public league table, which is not what
   * it was for.
   */
  viewScores: ['manager'],
  exportData: ['manager', 'ipad'],
  changeSettings: ['manager'],
};

export const can = (role: Role | null, capability: Capability): boolean =>
  role !== null && MATRIX[capability].includes(role);

/** Display name shown in the drawer header and used as the chat sender. */
export const roleLabel = (role: Role | null, workerName: string): string => {
  switch (role) {
    case 'manager':
      return 'Менежер';
    case 'ipad':
      return 'iPad';
    case 'worker':
      return workerName || 'Ажилтан';
    default:
      return '';
  }
};

/** Long-form label used on the sidebar. */
export const roleTitle = (role: Role | null, workerName: string): string =>
  role === 'ipad' ? 'iPad горим' : roleLabel(role, workerName);
