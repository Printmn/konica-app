/**
 * Persistence keys.
 *
 * The `pmn_*` names are kept byte-for-byte identical to the web app's
 * localStorage keys so that the same Firebase payloads round-trip unchanged.
 */

export const STORAGE_KEYS = {
  orders: 'pmn_orders',
  workLogs: 'pmn_worklogs',
  attendanceLogs: 'pmn_logs',
  employees: 'pmn_employees',
  colorLabels: 'pmn_colorlabels',
  calcTypes: 'pmn_calctypes',
  timeSettings: 'pmn_timesettings',
  inventory: 'pmn_inventory',
  services: 'pmn_services',
  tasks: 'pmn_tasks_v2',
  chatMessages: 'pmn_chatMessages',
  /** Messages composed offline, waiting to reach Firebase. */
  chatOutbox: 'pmn_chat_outbox',
  /** Random per-install id — the chat's stand-in for a user account. */
  deviceId: 'pmn_device_id',
  /** Timestamp of the newest chat message this device has seen. */
  chatLastRead: 'pmn_chat_last_read',
  writeQueue: 'pmn_write_queue',
  themeMode: 'pmn_theme_mode',
  /** Ring buffer of recent errors, so a release crash leaves a trace. */
  errorLog: 'pmn_error_log',
  lastBackup: 'pmn_last_backup',
  /** Highest invoice number actually issued, so the next one follows on. */
  lastInvoiceNumber: 'pmn_last_invoice_number',
  /** Android folder the shop picked for exports, as a Storage Access Framework URI. */
  exportFolder: 'pmn_export_folder',
  /** Last Expo push token published, so an unchanged one is not rewritten. */
  pushToken: 'pmn_push_token',
} as const;

/** Values that must never touch AsyncStorage — these go to SecureStore. */
export const SECURE_KEYS = {
  role: 'pmn_role',
  workerName: 'pmn_workerName',
  managerPin: 'pmn_pin_manager',
  ipadPin: 'pmn_pin_ipad',
  workerPin: 'pmn_pin_worker',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];
