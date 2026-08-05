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
    expect(html).toContain('Урьдчилгаа 50%');
    expect(html).toContain('Хөнгөлөлт 10%');
    expect(html).toContain('Дөчин есөн мянга таван зуун төгрөг');
    expect(html).toContain('Захиалга өгсөн');
    expect(html).toContain('№ 2026-014');
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
