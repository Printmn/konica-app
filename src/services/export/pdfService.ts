import * as Print from 'expo-print';

import type { DocType, QuotationForm, Result, WorkLog } from '@/types';
import { longDateLabel } from '@/utils/date';
import { formatNumber, payTypeAbbr } from '@/utils/price';
import { ok, toAppError } from '@/utils/result';

import { shareFile } from './fileService';
import { buildQuotationHtml } from './quotationTemplate';

/**
 * PDF generation and printing.
 *
 * Replaces `html2canvas + jsPDF` (and `window.print`). expo-print renders HTML
 * natively on both platforms, producing text-based PDFs rather than screenshots.
 */

async function htmlToPdf(html: string, dialogTitle: string): Promise<Result<string>> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const shared = await shareFile(uri, 'pdf', dialogTitle);
    if (!shared.ok) return { ok: false, error: shared.error };
    return ok(uri);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

/** Exports the quotation / invoice / receipt currently on screen. */
export function exportQuotationPdf(
  form: QuotationForm,
  docType: DocType,
): Promise<Result<string>> {
  return htmlToPdf(buildQuotationHtml(form, docType), 'Баримт хуваалцах');
}

/** Sends the same document to a physical printer via the OS print dialog. */
export async function printQuotation(
  form: QuotationForm,
  docType: DocType,
): Promise<Result<true>> {
  try {
    await Print.printAsync({ html: buildQuotationHtml(form, docType) });
    return ok(true);
  } catch (cause) {
    return { ok: false, error: toAppError(cause, 'unknown') };
  }
}

// ── Daily report PDF ─────────────────────────────────────────────────

export interface DailyReportPdfInput {
  date: string;
  logs: readonly WorkLog[];
  totalRevenue: number;
  totalTransfer: number;
  totalCash: number;
  totalCard: number;
  totalVat: number;
}

/**
 * A printable version of the daily report — the same numbers the Report screen
 * shows, laid out for A4.
 */
export function exportDailyReportPdf(input: DailyReportPdfInput): Promise<Result<string>> {
  const rows = input.logs
    .map(
      (log, index) => `
      <tr style="background:${index % 2 === 0 ? '#f8fafc' : '#ffffff'}">
        <td class="c">${index + 1}</td>
        <td class="c left">${(log.job || '').replace(/</g, '&lt;')}</td>
        <td class="c">${log.receivedTime || ''}</td>
        <td class="c right">${log.price ? `${formatNumber(Number(log.price))}₮` : ''}</td>
        <td class="c">${payTypeAbbr(log.payType)}</td>
        <td class="c">${log.hasVat ? 'НӨАТ' : ''}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="mn"><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#111827; }
  h1 { font-size: 18px; margin: 0 0 2px; color:#1a56db; }
  .sub { font-size: 11px; color:#6b7280; margin: 0 0 14px; }
  table { width:100%; border-collapse:collapse; font-size:11px; border:1px solid #d1d5db; }
  th { background:#1e40af; color:#fff; padding:6px; font-size:10px; border:1px solid #1e3a8a; }
  .c { padding:5px 6px; border:1px solid #e5e7eb; text-align:center; }
  .c.left { text-align:left; }
  .c.right { text-align:right; font-weight:700; }
  .totals { margin-top:14px; width:100%; border-collapse:collapse; font-size:12px; }
  .totals td { padding:6px 8px; border:1px solid #e5e7eb; }
  .totals td.k { color:#6b7280; }
  .totals td.v { text-align:right; font-weight:800; }
  .grand { background:#eff6ff; color:#1a56db; }
</style></head>
<body>
  <h1>PRINTMN KONICA — Өдрийн тайлан</h1>
  <p class="sub">${input.date} · ${longDateLabel(new Date())}</p>
  <table>
    <thead><tr><th>№</th><th>Ажил</th><th>Цаг</th><th>Дүн</th><th>Төлбөр</th><th>НӨАТ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td class="k">Данс</td><td class="v">${formatNumber(input.totalTransfer)}₮</td></tr>
    <tr><td class="k">Бэлэн</td><td class="v">${formatNumber(input.totalCash)}₮</td></tr>
    <tr><td class="k">Карт</td><td class="v">${formatNumber(input.totalCard)}₮</td></tr>
    <tr><td class="k">НӨАТ</td><td class="v">${formatNumber(input.totalVat)}₮</td></tr>
    <tr class="grand"><td class="k">Нийт орлого</td><td class="v">${formatNumber(input.totalRevenue)}₮</td></tr>
  </table>
</body></html>`;

  return htmlToPdf(html, 'Өдрийн тайлан');
}
