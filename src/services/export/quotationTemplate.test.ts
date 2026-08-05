import { describe, expect, it } from 'vitest';
import { emptyQuotationForm } from '@/features/quotation/quotationLogic';
import { buildQuotationHtml } from '@/services/export/quotationTemplate';

describe('buildQuotationHtml', () => {
  it('renders an advance invoice', () => {
    const form = {
      ...emptyQuotationForm(),
      customer: 'Тест ХХК',
      docNumber: '2026-014',
      dueDate: '2026-08-11',
      discountPercent: 10,
      paymentKind: 'advance' as const,
      advancePercent: 50,
      showSignature: true,
      showAmountInWords: true,
      items: [{ id: 1, name: 'Нэрийн хуудас', format: '', material: '', qty: 10, unitPrice: '10000' }],
    };
    const html = buildQuotationHtml(form, 'invoice');
    expect(html).toContain('Урьдчилгаа');
    expect(html).toContain('Хөнгөлөлт');
    expect(html).toContain('Дөчин есөн мянга таван зуун төгрөг');
    expect(html).toContain('Захиалга өгсөн');
    expect(html).toContain('НЭХЭМЖЛЭХ № 2026-014');
  });

  /**
   * An invoice is filed, stamped and reconciled, so it follows the shop's paper
   * form rather than the sales layout used for a quotation.
   */
  describe('invoices use the accounting form', () => {
    const invoice = {
      ...emptyQuotationForm('invoice'),
      customer: 'Тэст ХХК',
      date: '2026-08-04',
      dueDate: '2026-08-11',
      items: [
        { id: 1, name: 'Нэрийн хуудас', format: '', material: '', qty: 500, unitPrice: '850' },
      ],
    };

    it('writes the dates out in Mongolian', () => {
      const html = buildQuotationHtml(invoice, 'invoice');
      expect(html).toContain('2026 оны Наймдугаар сар 4');
      expect(html).toContain('2026 оны Наймдугаар сар 11');
    });

    it('names both parties', () => {
      const html = buildQuotationHtml(invoice, 'invoice');
      expect(html).toContain('Нэхэмжлэгч:');
      expect(html).toContain('Төлөгч:');
      expect(html).toContain('Тэст ХХК');
    });

    it('draws a full grid even when only one line is filled', () => {
      // The form is often completed by hand after printing; a table that stops
      // at the last filled row leaves nowhere to write.
      const html = buildQuotationHtml(invoice, 'invoice');
      expect(html.match(/class="c no"/g)).toHaveLength(5);
    });

    it('grows past five as products are added', () => {
      // Five is a floor, not a ceiling. The grid must follow the order.
      const withItems = (count: number) => ({
        ...invoice,
        items: Array.from({ length: count }, (_, index) => ({
          id: index + 1,
          name: `Мөр ${index + 1}`,
          format: '',
          material: '',
          qty: 1,
          unitPrice: '1000',
        })),
      });

      for (const count of [1, 5, 6, 8, 12]) {
        const rows = buildQuotationHtml(withItems(count), 'invoice').match(/class="c no"/g);
        expect(rows).toHaveLength(Math.max(5, count));
      }
    });

    it('puts the totals in the same table as the items', () => {
      // A table of its own has to guess the column widths of this one, and the
      // guess was visibly wrong — its rules landed a column short.
      const html = buildQuotationHtml(invoice, 'invoice');
      expect(html).toContain('<tfoot>');
      expect(html).not.toContain('table class="totals"');
    });

    it('shows the amount before VAT and the VAT on top, as the app calculates it', () => {
      const html = buildQuotationHtml(invoice, 'invoice');
      expect(html).toContain('(НӨАТ салгалт )');
      expect(html).toContain('425,000 ₮'); // 500 × 850, before VAT
      expect(html).toContain('42,500 ₮'); // 10% on top
      expect(html).toContain('467,500 ₮'); // what is owed
    });

    it('prints a receipt on the same form, under the same number', () => {
      // The pair is filed together; the shared number is the tie between them.
      const html = buildQuotationHtml({ ...invoice, docNumber: '2026-0007' }, 'receipt');
      expect(html).toContain('ЗАРЛАГЫН БАРИМТ № 2026-0007');
      expect(html).toContain('Нэхэмжлэгч:');
      expect(html).toContain('<p>Захиалга авсан');
      // A receipt records what went out; it does not demand payment by a date.
      expect(html).not.toContain('Нэхэмжилсэн:');
      expect(html).not.toContain('Төлөх:');
    });

    it('keeps the sales layout for a quotation of the same data', () => {
      const html = buildQuotationHtml({ ...invoice }, 'quotation');
      expect(html).toContain('PRINTMN KONICA');
      expect(html).not.toContain('Нэхэмжлэгч:');
    });
  });

  /**
   * The stamp is artwork that sits on the "Захиалга авсан" line. Printing it
   * on a document with no signature lines would leave it floating over the
   * bank details, so it is tied to that switch rather than standing alone.
   */
  describe('stamp and signature artwork', () => {
    const signed = {
      ...emptyQuotationForm(),
      showSignature: true,
      items: [{ id: 1, name: 'A', format: '', material: '', qty: 1, unitPrice: '1000' }],
    };

    it('prints the artwork when both switches are on', () => {
      const html = buildQuotationHtml({ ...signed, showStamp: true }, 'invoice');
      expect(html).toContain('class="stamp"');
      expect(html).toContain('class="signature"');
      expect(html).toContain('data:image/png;base64,');
    });

    it('leaves the lines blank when the stamp is off', () => {
      const html = buildQuotationHtml(signed, 'invoice');
      expect(html).toContain('<p>Захиалга авсан');
      expect(html).not.toContain('class="stamp"');
    });

    it('does not print artwork on a document with no signature lines', () => {
      const html = buildQuotationHtml(
        { ...signed, showSignature: false, showStamp: true },
        'invoice',
      );
      expect(html).not.toContain('class="stamp"');
      // Matched on the markup rather than the words: the stylesheet mentions
      // this line in a comment, and a bare text search catches that instead.
      expect(html).not.toContain('<p>Захиалга авсан');
    });
  });

  it('renders a plain quotation exactly as before', () => {
    const form = { ...emptyQuotationForm(), items: [{ id: 1, name: 'A', format: '', material: '', qty: 1, unitPrice: '1000' }] };
    const html = buildQuotationHtml(form, 'quotation');
    expect(html).toContain('НӨАТ 10%');
    expect(html).toContain('₮1,100');
    expect(html).not.toContain('Хөнгөлөлт');
    expect(html).not.toContain('Захиалга өгсөн');
  });
});
