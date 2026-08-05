import { quotationTotals } from '@/features/quotation/quotationLogic';
import type { DocType, QuotationForm } from '@/types';
import { percentText, tugrugInWords } from '@/utils/mongolian';
import { formatNumber, parsePrice } from '@/utils/price';

import { SIGNATURE_DATA_URI, STAMP_DATA_URI } from './documentAssets';
import { buildInvoiceHtml } from './invoiceTemplate';

/**
 * Print template for quotations, invoices and receipts.
 *
 * The web app rendered this document as a `<div>` and screenshotted it with
 * html2canvas, which produced a fuzzy raster PDF. Here the same markup is fed
 * straight to expo-print, so the output is real vector text — sharper, smaller,
 * and selectable. The layout, colours and copy are identical to the original,
 * including the bank details block.
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const docTypeHeading = (docType: DocType): string => {
  switch (docType) {
    case 'invoice':
      return 'НЭХЭМЖЛЭХ';
    case 'receipt':
      return 'ЗАРЛАГЫН БАРИМТ';
    default:
      return 'ҮНИЙН САНАЛ';
  }
};

export function buildQuotationHtml(form: QuotationForm, docType: DocType): string {
  // The invoice and its receipt are accounting documents and follow the shop's
  // paper form; a quotation keeps this sales layout.
  if (docType === 'invoice' || docType === 'receipt') return buildInvoiceHtml(form, docType);

  const rows = form.items
    .map((item, index) => {
      const unitPrice = parsePrice(item.unitPrice);
      const total = unitPrice * (Number(item.qty) || 1);
      const background = index % 2 === 0 ? '#f8fafc' : '#ffffff';
      return `
        <tr style="background:${background}">
          <td class="cell name">${escapeHtml(item.name || '—')}</td>
          <td class="cell num">${escapeHtml(String(item.qty))}</td>
          <td class="cell num">₮${formatNumber(unitPrice)}</td>
          <td class="cell num accent">₮${formatNumber(total)}</td>
        </tr>`;
    })
    .join('');

  const totals = quotationTotals(form);

  /** One line in the totals block, spanning the first three columns. */
  const totalRow = (label: string, amount: number, cls = 'num'): string => `
        <tr style="background:#f8fafc">
          <td class="cell num muted" colspan="3">${label}</td>
          <td class="cell ${cls}">${amount < 0 ? '−' : ''}₮${formatNumber(Math.abs(amount))}</td>
        </tr>`;

  let totalsRows = '';
  if (form.showTotal) {
    const lines: string[] = [];
    // The base line is only worth printing when something is taken off or
    // added below it; otherwise it just repeats the grand total.
    if (totals.discount > 0 || totals.vat > 0) {
      lines.push(totalRow('Үндсэн дүн:', totals.base));
    }
    if (totals.discount > 0) {
      lines.push(
        totalRow(`Хөнгөлөлт ${percentText(form.discountPercent)}:`, -totals.discount, 'num muted'),
      );
    }
    if (totals.vat > 0) lines.push(totalRow('НӨАТ 10%:', totals.vat, 'num vat'));
    if (form.paymentKind === 'advance') {
      lines.push(totalRow(`Урьдчилгаа ${percentText(form.advancePercent)}:`, totals.advance));
    }
    if (form.paymentKind === 'balance' && totals.advancePaid > 0) {
      lines.push(totalRow('Урьдчилгаа төлсөн:', -totals.advancePaid, 'num muted'));
    }
    lines.push(`
        <tr style="background:#eff6ff">
          <td class="grand-label" colspan="3">Нийт дүн:</td>
          <td class="grand-value">₮${formatNumber(totals.grand)}</td>
        </tr>`);
    totalsRows = lines.join('');
  }

  const amountInWordsBlock =
    form.showAmountInWords && form.showTotal
      ? `<div class="words">
           <p class="words-label">Мөнгөний дүн (үсгээр)</p>
           <p class="words-value">${escapeHtml(tugrugInWords(totals.grand))} болно.</p>
         </div>`
      : '';

  /**
   * The stamp and signature sit *over* the "Захиалга авсан" line rather than
   * beside it, which is how the paper form is actually signed. They are
   * absolutely positioned so adding them cannot push the rest of the document
   * onto a second page.
   */
  const stampOverlay =
    form.showStamp && form.showSignature
      ? [
          STAMP_DATA_URI
            ? `<img class="stamp" src="${STAMP_DATA_URI}" alt="" />`
            : '',
          SIGNATURE_DATA_URI
            ? `<img class="signature" src="${SIGNATURE_DATA_URI}" alt="" />`
            : '',
        ].join('')
      : '';

  const signatureBlock = form.showSignature
    ? `<div class="sign">
         <div class="sign-row">
           <div class="sign-col">
             <p>Захиалга өгсөн: ………….…...…. ( ………............. )</p>
             <p class="sign-caption"><span>Гарын үсэг</span><span>Нэр</span></p>
           </div>
           <div class="sign-col receiver">
             ${stampOverlay}
             <p>Захиалга авсан: ……………...… ( ………………... )</p>
             <p class="sign-caption"><span>Гарын үсэг</span><span>Нэр</span></p>
           </div>
         </div>
         <p class="sign-received">
           Дээр дурдагдсан захиалгат бүтээгдэхүүнийг тоо ёсоор хүлээн авлаа
           ……………………… ( ………………... )
         </p>
         <p class="sign-date">20 …. оны …. сарын …. өдөр</p>
       </div>`
    : '';

  const numberLine = form.docNumber
    ? `<p>№ ${escapeHtml(form.docNumber)}</p>`
    : '';

  const dueLine =
    form.dueDate && form.dueDate !== form.date
      ? `<p>Төлөх: ${escapeHtml(form.dueDate)}</p>`
      : '';

  const phoneBlock = form.phone
    ? `<div style="text-align:right">
         <p class="label">Утас</p>
         <p class="value">${escapeHtml(form.phone)}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; color: #111827; }
  .doc { border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }
  .header { background: #1a56db; color: #fff; padding: 16px 20px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-weight: 900; font-size: 17px; margin: 0; letter-spacing: 0.5px; }
  .meta { text-align: right; font-size: 11px; opacity: 0.9; }
  .meta p { margin: 0; }
  .doc-type { font-weight: 900; font-size: 16px; margin: 10px 0 2px; text-align: center; letter-spacing: 1px; }
  .contact { font-size: 11px; margin: 0; text-align: center; opacity: 0.85; }
  .party { padding: 12px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
  .label { font-size: 10px; color: #6b7280; margin: 0 0 2px; }
  .value { font-weight: 700; font-size: 13px; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #d1d5db; }
  thead tr { background: #1e40af; color: #fff; }
  th { padding: 6px 8px; font-weight: 700; white-space: nowrap; border: 1px solid #1e3a8a; font-size: 10px; }
  th.left { text-align: left; }
  th.right { text-align: right; }
  .cell { padding: 5px 8px; border: 1px solid #e5e7eb; }
  .cell.name { font-weight: 600; }
  .cell.num { text-align: right; }
  .cell.accent { font-weight: 700; color: #1a56db; }
  .cell.muted { font-size: 11px; color: #6b7280; }
  .cell.vat { color: #16a34a; font-weight: 700; }
  .grand-label { padding: 7px 8px; text-align: right; font-weight: 700; font-size: 12px; border: 2px solid #1a56db; }
  .grand-value { padding: 7px 8px; text-align: right; font-weight: 900; font-size: 13px; color: #1a56db; border: 2px solid #1a56db; }
  .terms { padding: 10px 20px; border-top: 1px solid #e5e7eb; }
  .terms ul { margin: 0; padding-left: 16px; font-size: 11px; color: #374151; line-height: 1.9; }
  .bank { background: #f1f5f9; padding: 10px 20px; border-top: 2px solid #dbeafe; }
  .bank h4 { font-weight: 800; font-size: 11px; margin: 0 0 6px; color: #374151; }
  .bank p { font-size: 10px; color: #374151; margin: 0 0 3px; line-height: 1.7; }
  .bank .warn { color: #b45309; font-weight: 700; margin-top: 5px; }
  .words { padding: 8px 20px 4px; border-top: 1px solid #e5e7eb; }
  .words-label { font-size: 10px; color: #6b7280; margin: 0 0 4px; }
  .words-value { font-size: 11px; font-style: italic; text-align: center;
                 text-decoration: underline; margin: 0; }
  .sign { padding: 10px 20px 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #374151; }
  .sign p { margin: 0; }
  .sign-row { display: flex; gap: 16px; }
  .sign-col { flex: 1; }
  .sign-caption { display: flex; gap: 40px; justify-content: center;
                  font-size: 8px; color: #6b7280; margin-top: 2px; }
  .sign-received { margin-top: 12px; text-align: center; }
  .sign-date { margin-top: 12px; text-align: center; }
  .sign-col.receiver { position: relative; }
  .sign-col.receiver .stamp {
    position: absolute; left: 0; bottom: -14px; width: 96px; opacity: 0.85;
  }
  .sign-col.receiver .signature {
    position: absolute; left: 62px; bottom: -6px; width: 104px;
  }
</style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <div class="header-top">
        <p class="brand">PRINTMN KONICA</p>
        <div class="meta">
          <p>Улаанбаатар, Монгол</p>
          ${numberLine}
          <p>Огноо: ${escapeHtml(form.date)}</p>
          ${dueLine}
        </div>
      </div>
      <p class="doc-type">${docTypeHeading(docType)}</p>
      <p class="contact">Утас 8022-2323</p>
    </div>

    <div class="party">
      <div>
        <p class="label">Захиалагч</p>
        <p class="value">${escapeHtml(form.customer || '—')}</p>
      </div>
      ${phoneBlock}
    </div>

    <table>
      <thead>
        <tr>
          <th class="left">Бүтээгдэхүүн</th>
          <th class="right">Тоо/ш</th>
          <th class="right">Нэгж үнэ</th>
          <th class="right">Нийт үнэ</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${totalsRows}
      </tbody>
    </table>

    ${amountInWordsBlock}

    <div class="terms">
      <ul>
        <li>Бэлэн болох хугацаа: <b>${escapeHtml(form.readyTime)}</b></li>
        ${form.vatIncluded ? '<li>НӨАТ орсон</li>' : ''}
        <li>1 сарын хугацаанд хүчинтэй</li>
      </ul>
    </div>

    <div class="bank">
      <h4>ТӨЛБӨРИЙН МЭДЭЭЛЭЛ</h4>
      <p>🏦 <b>Хаан банк:</b> 5035298851 | Данс: Төгрөгийн | Б.Сарантуяа</p>
      <p>🏦 <b>Голомт банк:</b> 3455131376 — Блью Райгел ХХК (Компани данс)</p>
      <p class="warn">
        Гүйлгээний утган дээр байгууллагын нэр, регистерийн дугаарыг бичнэ үү !
      </p>
    </div>

    ${signatureBlock}
  </div>
</body>
</html>`;
}
