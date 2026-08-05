import { quotationTotals } from '@/features/quotation/quotationLogic';
import type { QuotationForm } from '@/types';
import { mongolianLongDate, percentText, tugrugInWords } from '@/utils/mongolian';
import { formatNumber, parsePrice } from '@/utils/price';

import { SELLER, SIGNATURE_DATA_URI, STAMP_DATA_URI } from './documentAssets';

/**
 * The invoice and its receipt, laid out the way the shop's paper forms are.
 *
 * A quotation is a sales document and looks like one — coloured header, only
 * the rows that were quoted. An invoice is an accounting document: it is filed,
 * stamped, signed and reconciled, so it follows the printed form people already
 * know. That means black rules rather than colour, a fixed grid of numbered
 * lines whether or not they are all used, the amount written out in words, and
 * signature lines at the foot.
 *
 * The empty rows are not padding for looks. The form is often completed by hand
 * after printing — an extra item added at the counter — and a table that stops
 * at the last filled row leaves nowhere to write.
 *
 * VAT follows the app's own rule and is added on top at 10%; the «НӨАТ салгалт»
 * line shows the amount before it, which is what that row means on the paper
 * form.
 *
 * A зарлагын баримт uses the same sheet. It is the invoice's counterpart —
 * the paper that travels with the goods — and the two are filed together under
 * one number, so printing them on the same form is what makes the pair legible
 * to whoever reconciles them later.
 */

/** Lines the grid always draws, filled or not. */
const MIN_ROWS = 5;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** `2026-08-04` → `2026 оны Наймдугаар сар 4`, falling back to the raw text. */
const longDate = (value: string): string => (value ? mongolianLongDate(value) : '—');

/** Which of the two accounting documents is being printed. */
export type AccountingDocType = 'invoice' | 'receipt';

export function buildInvoiceHtml(
  form: QuotationForm,
  docType: AccountingDocType = 'invoice',
): string {
  const isReceipt = docType === 'receipt';
  const totals = quotationTotals(form);

  const filled = form.items.filter((item) => item.name.trim() !== '' || item.unitPrice !== '');
  const blanks = Math.max(0, MIN_ROWS - filled.length);

  const rows = filled
    .map((item, index) => {
      const unitPrice = parsePrice(item.unitPrice);
      const quantity = Number(item.qty) || 1;
      return `
        <tr>
          <td class="c no">${index + 1}</td>
          <td class="c name">${escapeHtml(item.name)}</td>
          <td class="c num">${escapeHtml(String(item.qty))}</td>
          <td class="c num">${formatNumber(unitPrice)}</td>
          <td class="c num">${formatNumber(unitPrice * quantity)}</td>
        </tr>`;
    })
    .join('');

  const emptyRows = Array.from(
    { length: blanks },
    (_, index) => `
        <tr>
          <td class="c no">${filled.length + index + 1}</td>
          <td class="c"></td>
          <td class="c"></td>
          <td class="c"></td>
          <td class="c"></td>
        </tr>`,
  ).join('');

  /**
   * The totals live in the same table as the items, not a second one beside
   * it. A separate table has to guess the column widths of the first, and the
   * guess was visibly wrong — its rules landed a column short of the grid
   * above. As footer rows they inherit the real widths and every vertical line
   * runs straight down the page.
   *
   * The label sits in the «Тоо хэмжээ» and «Нэгжийн үнэ» columns, the amount
   * in «Нийт үнэ», and a percentage — where there is one — takes the unit-price
   * column on its own.
   */
  interface TotalLine {
    label: string;
    percent: string;
    amount: number;
    strong?: boolean;
  }

  const totalLines: TotalLine[] = [
    ...(form.vatIncluded
      ? [
          { label: '(НӨАТ салгалт )', percent: '', amount: totals.afterDiscount },
          { label: 'НӨАТ', percent: '', amount: totals.vat },
        ]
      : []),
    { label: 'Хөнгөлөлт', percent: percentText(form.discountPercent), amount: totals.discount },
    ...(form.paymentKind === 'advance'
      ? [
          {
            label: 'Урьдчилгаа',
            percent: percentText(form.advancePercent),
            amount: totals.advance,
          },
        ]
      : []),
    ...(form.paymentKind === 'balance'
      ? [{ label: 'Урьдчилгаа төлсөн', percent: '', amount: -totals.advancePaid }]
      : []),
    { label: 'Нийт дүн', percent: '', amount: totals.grand, strong: true },
  ];

  const kindNote =
    isReceipt
      ? ''
      : form.paymentKind === 'advance'
        ? `<p class="kind">( Урьдчилгааны нэхэмжлэх — ${percentText(form.advancePercent)} )</p>`
        : form.paymentKind === 'balance'
          ? '<p class="kind">( Үлдэгдэл төлбөрийн нэхэмжлэх )</p>'
          : '';

  const stampOverlay = form.showStamp
    ? [
        STAMP_DATA_URI ? `<img class="stamp" src="${STAMP_DATA_URI}" alt="" />` : '',
        SIGNATURE_DATA_URI
          ? `<img class="signature" src="${SIGNATURE_DATA_URI}" alt="" />`
          : '',
      ].join('')
    : '';

  const wordsCell = form.showAmountInWords
    ? `<p class="words-label">Мөнгөний дүн (үсгээр)</p>
       <p class="words-value">${escapeHtml(tugrugInWords(totals.grand))}</p>
       <p class="words-tail">болно.</p>`
    : '';

  const totalsRows = totalLines
    .map((line, index) => {
      // The written amount sits beside the whole block, so it is one tall cell
      // opened on the first row.
      const words =
        index === 0
          ? `<td class="wordsCell" colspan="2" rowspan="${totalLines.length}">${wordsCell}</td>`
          : '';
      const label =
        line.percent === ''
          ? `<td class="t label" colspan="2">${line.label}</td>`
          : `<td class="t label">${line.label}</td><td class="t pct">${line.percent}</td>`;
      return `
        <tr${line.strong ? ' class="grand"' : ''}>
          ${words}
          ${label}
          <td class="t value">${line.amount < 0 ? '−' : ''}${formatNumber(
            Math.abs(line.amount),
          )} ₮</td>
        </tr>`;
    })
    .join('');

  const signatures = form.showSignature
    ? `<div class="sign">
         <div class="sign-row">
           <div class="sign-col">
             <p>Захиалга өгсөн: ………………… ( ………………… )</p>
             <p class="caption"><span>Гарын үсэг</span><span>Нэр</span></p>
           </div>
           <div class="sign-col receiver">
             ${stampOverlay}
             <p>Захиалга авсан: ………………… ( ………………… )</p>
             <p class="caption"><span>Гарын үсэг</span><span>Нэр</span></p>
           </div>
         </div>

         <p class="received">
           Дээр дурдагдсан захиалгат бүтээгдэхүүнийг тоо ёсоор хүлээн авлаа
           ………………………… ( ………………… )
         </p>
         <p class="caption received-caption"><span>Гарын үсэг</span><span>Нэр</span></p>

         <p class="sign-date">20 …. оны …. сарын …. өдөр</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    margin: 0; color: #000; font-size: 11px; line-height: 1.45;
  }

  h1 {
    text-align: center; font-size: 15px; font-weight: 800;
    text-decoration: underline; margin: 0 0 18px;
  }
  .kind { text-align: center; margin: -12px 0 14px; font-style: italic; }

  .parties { display: flex; gap: 24px; margin-bottom: 14px; }
  .party { flex: 1; }
  .party h2 { font-size: 11px; font-weight: 400; margin: 0 0 2px; }
  .party .who { font-size: 12px; font-weight: 800; margin: 0 0 2px; }
  .party p { margin: 0; }
  .party b { font-weight: 800; }
  .note {
    font-style: italic; font-size: 10px; margin-top: 4px;
    padding-left: 22px; text-align: center;
  }
  .dates { text-align: right; }
  .dates span { display: inline-block; min-width: 96px; text-align: right; }

  table.items { width: 100%; border-collapse: collapse; }
  table.items th, table.items td { border: 1px solid #000; padding: 5px 6px; height: 24px; }
  table.items th { font-weight: 800; text-align: center; }
  .c.no { width: 32px; text-align: center; }
  .c.name { font-weight: 700; }
  .c.num { text-align: right; }
  th.qty { width: 92px; }
  th.unit { width: 96px; }
  th.total { width: 118px; }

  /* Qualified on purpose. The blanket cell border above is written as an
     element selector and outranks a bare class, so a plain .wordsCell rule
     left the box drawn. The written amount has no box of its own — the rules
     around it belong to the totals cells beside it. */
  table.items td.wordsCell {
    border: 0; vertical-align: top; padding: 6px 10px 0 0;
  }
  .words-label { margin: 0; }
  .words-value {
    margin: 16px 0 0; text-align: center; font-style: italic;
    font-weight: 700; text-decoration: underline;
  }
  .words-tail { margin: 8px 0 0; text-align: right; padding-right: 24px; }

  .t.label { text-align: center; }
  .t.pct { text-align: center; }
  .t.value { text-align: right; font-style: italic; }
  tr.grand .t.label, tr.grand .t.value { font-weight: 800; }

  .sign { margin-top: 30px; font-size: 10px; }
  .sign p { margin: 0; }
  /* The band above the signature lines is where the stamp and signature go —
     reserved here so the artwork sits above the line the way a real one does,
     instead of landing on top of the words. */
  .sign-row { display: flex; gap: 24px; padding-top: 62px; }
  .sign-col { flex: 1; position: relative; }
  /* Qualified on purpose. The reset above is .sign p, which outranks a bare
     class, so the spacing below was silently zeroed out without it. */
  .sign p.caption {
    display: flex; gap: 46px; justify-content: center;
    font-size: 9px; margin-top: 3px;
  }
  .sign p.received { margin-top: 30px; text-align: center; }
  .sign p.received-caption { padding-left: 210px; }
  .sign p.sign-date { margin-top: 22px; text-align: center; }

  /* Absolutely positioned so adding the artwork can never push the document
     onto a second page. */
  /* The stamp straddles the receiver's line the way it is pressed onto the
     paper form — over the words, not tidily above them. It is a red outline,
     so the text underneath stays readable; the slight rotation is what a
     hand-pressed stamp actually looks like. */
  .receiver .stamp {
    position: absolute; left: -26px; top: -24px; width: 116px;
    opacity: 0.85; transform: rotate(-7deg);
  }
  .receiver .signature { position: absolute; left: 78px; top: -50px; width: 120px; }
</style>
</head>
<body>
  <h1>${isReceipt ? 'ЗАРЛАГЫН БАРИМТ' : 'НЭХЭМЖЛЭХ'} ${
    form.docNumber ? `№ ${escapeHtml(form.docNumber)}` : ''
  }</h1>
  ${kindNote}

  <div class="parties">
    <div class="party">
      <h2>Нэхэмжлэгч:</h2>
      <p class="who">${escapeHtml(SELLER.company)}</p>
      <p>Утас: ${escapeHtml(SELLER.phone)}</p>
      <p>Банк: <b>${escapeHtml(SELLER.bank1Name)}</b> , Данс: <b>${escapeHtml(SELLER.bank1Account)}</b></p>
      <p>Банк: <b>${escapeHtml(SELLER.bank2Name)}</b> , Данс: <b>${escapeHtml(SELLER.bank2Account)}</b></p>
      <p class="note">${escapeHtml(SELLER.transferNote)}</p>
    </div>

    <div class="party">
      <h2>Төлөгч:</h2>
      <p class="who">${escapeHtml(form.customer || '—')}</p>
      ${form.phone ? `<p>Утас: ${escapeHtml(form.phone)}</p>` : ''}
      <div class="dates">
        ${
          isReceipt
            ? `<p>Огноо: <span>${escapeHtml(longDate(form.date))}</span></p>
               ${
                 form.docNumber
                   ? `<p>Нэхэмжлэх: <span>№ ${escapeHtml(form.docNumber)}</span></p>`
                   : ''
               }`
            : `<p>Нэхэмжилсэн: <span>${escapeHtml(longDate(form.date))}</span></p>
               <p>Төлөх: <span>${escapeHtml(longDate(form.dueDate || form.date))}</span></p>`
        }
      </div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>№</th>
        <th>Бүтээгдэхүүний нэр</th>
        <th class="qty">Тоо хэмжээ</th>
        <th class="unit">Нэгжийн үнэ</th>
        <th class="total">Нийт үнэ</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${emptyRows}
    </tbody>
    <tfoot>
      ${totalsRows}
    </tfoot>
  </table>

  ${signatures}
</body>
</html>`;
}
