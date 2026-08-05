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
  | 'viewPerformance'
  | 'viewQuotation'
  | 'viewAdmin'
  | 'viewChat'
  | 'editCatalog'
  | 'editWorkLogs'
  | 'deleteWorkLogs'
  | 'manageEmployees'
  | 'manageHabits'
  | 'exportData'
  | 'changeSettings';

const MATRIX: Readonly<Record<Capability, readonly Role[]>> = {
  viewHome: ['manager', 'ipad', 'worker'],
  viewOrders: ['manager', 'ipad'],
  viewWorkLogs: ['manager', 'ipad'],
  viewAttendance: ['manager', 'ipad', 'worker'],
  viewInventory: ['manager', 'ipad', 'worker'],
  viewServices: ['manager', 'ipad', 'worker'],
  viewReport: ['manager', 'ipad'],
  viewPerformance: ['manager', 'ipad'],
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
  manageHabits: ['manager', 'ipad'],
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
