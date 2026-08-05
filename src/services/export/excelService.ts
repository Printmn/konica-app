import * as XLSX from 'xlsx-js-style';
import type { CellObject, WorkSheet } from 'xlsx-js-style';

import { MAX_MONTHLY_BONUS } from '@/constants/config';
import { dailyMaxScore } from '@/features/performance/bonusCalculator';
import { performanceLabel } from '@/features/worklogs/workLogLogic';
import { totalsByPayType } from '@/features/reports/reportCalculator';
import { EXCEL_COLORS } from '@/theme/colors';
import type { EmployeePerformance, HabitTask, Result, WorkLog } from '@/types';
import { formatNumber, payTypeAbbr } from '@/utils/price';
import { err, ok, toAppError } from '@/utils/result';

import {
  HEADER_STYLE,
  PERFORMANCE_HEADERS,
  PERFORMANCE_WIDTHS,
  THIN_BORDER,
  WORKLOG_HEADERS,
  WORKLOG_WIDTHS_DAILY,
  WORKLOG_WIDTHS_MONTHLY,
  cellStyle,
  workLogFill,
} from './excelStyles';
import { saveAndShare } from './fileService';

/**
 * Excel export.
 *
 * The web build loaded `xlsx-js-style` from a CDN at runtime and called
 * `XLSX.writeFile`, which only exists in a browser. Here the same library is
 * bundled, the workbook is serialised to base64, written to disk with
 * expo-file-system, and handed to the OS share sheet.
 *
 * Sheet layout, colours, column widths and the summary rows are unchanged, so
 * the files the shop archives keep looking exactly the same.
 */

type SheetRow = {
  values: (string | number)[];
  bg?: string;
  isTotal?: boolean;
  isSummary?: boolean;
  isSeparator?: boolean;
};

/** Builds a fully styled sheet from a header row plus tagged data rows. */
function buildSheet(
  headers: readonly string[],
  widths: readonly number[],
  rows: readonly SheetRow[],
  options: { summaryColumns?: { label: number; value: number } } = {},
): WorkSheet {
  const aoa = [[...headers], ...rows.map((row) => row.values)];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!rows'] = [{ hpt: 24 }, ...rows.map((row) => ({ hpt: row.isTotal ? 22 : 18 }))];

  headers.forEach((_, columnIndex) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const cell = sheet[address] as CellObject | undefined;
    if (cell) cell.s = HEADER_STYLE;
  });

  const blank = cellStyle(EXCEL_COLORS.WHITE);
  const summaryCols = options.summaryColumns;

  rows.forEach((row, rowIndex) => {
    const background = row.bg ?? EXCEL_COLORS.WHITE;
    const bold = background !== EXCEL_COLORS.WHITE;

    headers.forEach((_, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
      if (!sheet[address]) sheet[address] = { v: '', t: 's' } satisfies CellObject;
      const cell = sheet[address] as CellObject;

      if (row.isSeparator) {
        cell.s = blank;
        return;
      }

      if ((row.isTotal || row.isSummary) && summaryCols) {
        const fill = row.isTotal ? EXCEL_COLORS.GOLD : EXCEL_COLORS.PEACH;
        if (columnIndex === summaryCols.label) {
          cell.s = {
            fill: { fgColor: { rgb: fill }, patternType: 'solid' },
            font: { bold: true, sz: row.isTotal ? 11 : undefined },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: { ...THIN_BORDER },
          };
        } else if (columnIndex === summaryCols.value) {
          cell.s = {
            fill: { fgColor: { rgb: fill }, patternType: 'solid' },
            font: { bold: true, sz: row.isTotal ? 12 : undefined },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: { ...THIN_BORDER },
          };
        } else {
          cell.s = blank;
        }
        return;
      }

      cell.s = cellStyle(background, bold, columnIndex === 0);
    });
  });

  return sheet;
}

/** Maps one work log onto the eight export columns. */
const workLogRow = (log: WorkLog, index: number, advancePink: boolean): SheetRow => ({
  bg: workLogFill(log, advancePink),
  values: [
    index + 1,
    log.job || '',
    log.receivedTime || '',
    log.isTomorrow ? `Маргааш ${log.deadline || ''}` : log.deadline || '',
    log.phone || '',
    log.price ? `${formatNumber(Number(log.price))}₮ ${payTypeAbbr(log.payType)}` : '',
    log.note || '',
    performanceLabel(log),
  ],
});

// ── Daily export ─────────────────────────────────────────────────────

/**
 * One sheet for one day, with per-payment-type subtotals and a grand total in
 * the right-hand columns (F/G), matching the daily export from the web app.
 */
export async function exportDailyWorkLogs(
  logs: readonly WorkLog[],
  date: string,
): Promise<Result<string>> {
  try {
    if (logs.length === 0) {
      return err('validation', 'Тухайн өдөр бүртгэл байхгүй байна.');
    }

    const dataRows = logs.map((log, index) => workLogRow(log, index, false));
    const byType = totalsByPayType(logs);
    const total = Object.values(byType).reduce((sum, value) => sum + value, 0);

    const summaryRows: SheetRow[] = [
      { values: ['', '', '', '', '', '', '', ''], isSeparator: true },
      ...Object.entries(byType).map<SheetRow>(([type, amount]) => ({
        isSummary: true,
        values: ['', '', '', '', '', `${type}:`, `${formatNumber(amount)}₮`, ''],
      })),
      {
        isTotal: true,
        values: ['', '', '', '', '', 'НИЙТ ДҮН:', `${formatNumber(total)}₮`, ''],
      },
    ];

    const workbook = XLSX.utils.book_new();
    const sheet = buildSheet(
      WORKLOG_HEADERS,
      WORKLOG_WIDTHS_DAILY,
      [...dataRows, ...summaryRows],
      { summaryColumns: { label: 5, value: 6 } },
    );
    XLSX.utils.book_append_sheet(workbook, sheet, date);

    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }) as string;
    return saveAndShare(`Printmn_${date}.xlsx`, base64, 'xlsx', 'Өдрийн тайлан');
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

// ── Monthly export ───────────────────────────────────────────────────

export interface MonthlyExportInput {
  month: string; // YYYY-MM
  workLogs: readonly WorkLog[];
  performance: readonly EmployeePerformance[];
  tasks: readonly HabitTask[];
}

/**
 * One sheet per day of the month plus a "Дадал үзүүлэлт" leaderboard sheet.
 * The daily sheets put their totals in column A, which is how the original
 * monthly workbook laid them out.
 */
export async function exportMonthlyWorkbook(
  input: MonthlyExportInput,
): Promise<Result<string>> {
  try {
    const { month, workLogs, performance, tasks } = input;
    const monthLogs = workLogs.filter((log) => log.date && log.date.startsWith(month));

    if (monthLogs.length === 0 && performance.length === 0) {
      return err('validation', 'Тухайн сард өгөгдөл байхгүй байна.');
    }

    const workbook = XLSX.utils.book_new();
    const dates = [...new Set(monthLogs.map((log) => log.date))].sort();

    for (const date of dates) {
      const dayLogs = monthLogs.filter((log) => log.date === date);
      const dataRows = dayLogs.map((log, index) => workLogRow(log, index, true));

      const byType = totalsByPayType(dayLogs);
      const total = Object.values(byType).reduce((sum, value) => sum + value, 0);

      const summaryRows: SheetRow[] = [
        { bg: EXCEL_COLORS.WHITE, values: ['', '', '', '', '', '', '', ''] },
        ...Object.entries(byType).map<SheetRow>(([type, amount]) => ({
          bg: EXCEL_COLORS.PEACH,
          values: [`${type}-${formatNumber(amount)}₮`, '', '', '', '', '', '', ''],
        })),
        {
          bg: EXCEL_COLORS.GOLD,
          values: [`Нийт-${formatNumber(total)}₮`, '', '', '', '', '', '', ''],
        },
      ];

      const sheet = buildSheet(WORKLOG_HEADERS, WORKLOG_WIDTHS_MONTHLY, [
        ...dataRows,
        ...summaryRows,
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet, date);
    }

    const dailyMax = dailyMaxScore(tasks);
    const performanceRows: SheetRow[] = performance.map((employee, index) => ({
      bg: index === 0 ? EXCEL_COLORS.HIGHLIGHT : EXCEL_COLORS.WHITE,
      values: [
        index + 1,
        employee.name,
        employee.onTime,
        employee.late,
        employee.workDays,
        employee.score,
        `${Math.round(employee.pct * 100)}%`,
        `${formatNumber(employee.bonus)}₮`,
      ],
    }));

    performanceRows.push({ bg: EXCEL_COLORS.WHITE, values: ['', '', '', '', '', '', '', ''] });
    performanceRows.push({
      bg: EXCEL_COLORS.LGRAY,
      values: [
        `Өдрийн макс оноо: ${dailyMax}  |  Урамшуулал макс: ${formatNumber(MAX_MONTHLY_BONUS)}₮`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    });

    const performanceSheet = buildSheet(
      PERFORMANCE_HEADERS,
      PERFORMANCE_WIDTHS,
      performanceRows,
    );
    XLSX.utils.book_append_sheet(workbook, performanceSheet, 'Дадал үзүүлэлт');

    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }) as string;
    return saveAndShare(`Printmn_${month}.xlsx`, base64, 'xlsx', 'Сарын тайлан');
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

// ── Import ───────────────────────────────────────────────────────────

export interface ImportedRow {
  [column: string]: string | number | undefined;
}

/**
 * Parses a spreadsheet the user picked from Files/Drive.
 * Returns the first sheet as plain objects keyed by the header row.
 */
export function parseWorkbook(base64: string): Result<ImportedRow[]> {
  try {
    const workbook = XLSX.read(base64, { type: 'base64', cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return err('validation', 'Файлд хуудас олдсонгүй.');
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return err('validation', 'Хуудсыг уншиж чадсангүй.');
    return ok(XLSX.utils.sheet_to_json<ImportedRow>(sheet));
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'validation') };
  }
}
