import type { CellStyle } from 'xlsx-js-style';

import { EXCEL_COLORS } from '@/theme/colors';
import type { WorkLog } from '@/types';

/**
 * Shared Excel styling.
 *
 * The colour rules and the header look are exactly what the two web exporters
 * produced, extracted here so the daily sheet and the monthly workbook cannot
 * drift apart.
 */

/**
 * `xlsx-js-style` requires an explicit colour on every border edge, so the grey
 * is stated once here rather than repeated at each call site.
 */
const BORDER_EDGE = { style: 'thin' as const, color: { rgb: 'D0D0D0' } };

export const THIN_BORDER = {
  top: BORDER_EDGE,
  left: BORDER_EDGE,
  bottom: BORDER_EDGE,
  right: BORDER_EDGE,
};

export const HEADER_STYLE: CellStyle = {
  font: { bold: true, color: { rgb: EXCEL_COLORS.WHITE }, sz: 10 },
  fill: { fgColor: { rgb: EXCEL_COLORS.BLUE }, patternType: 'solid' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { ...THIN_BORDER },
};

export const cellStyle = (
  background: string,
  bold = false,
  center = false,
): CellStyle => ({
  fill: { fgColor: { rgb: background }, patternType: 'solid' },
  font: bold ? { bold: true } : {},
  alignment: {
    vertical: 'center',
    horizontal: center ? 'center' : 'left',
    wrapText: true,
  },
  border: { ...THIN_BORDER },
});

/**
 * Row fill for a work log.
 *
 * The daily and monthly exporters differed by one line in the original: the
 * daily one folded `Урьдчилгаа` into red, the monthly one gave it its own pink.
 * `advancePink` selects between the two so both stay faithful.
 */
export const workLogFill = (
  log: Pick<WorkLog, 'status' | 'paymentStatus' | 'isTomorrow'>,
  advancePink: boolean,
): string => {
  const status = log.status || '';
  const payment = log.paymentStatus || '';

  if (status === 'Болсон') return EXCEL_COLORS.GREEN;
  if (status === 'Болсон аваагүй') return EXCEL_COLORS.ORANGE;
  if (status === 'Маргааш авна' || log.isTomorrow) return EXCEL_COLORS.YELLOW;

  if (advancePink) {
    if (status === 'Тооцоотой' || status === 'Болоогүй' || payment === 'Тооцоотой')
      return EXCEL_COLORS.RED;
    if (payment === 'Урьдчилгаа') return EXCEL_COLORS.PINK;
    return EXCEL_COLORS.WHITE;
  }

  if (
    status === 'Тооцоотой' ||
    status === 'Болоогүй' ||
    payment === 'Тооцоотой' ||
    payment === 'Урьдчилгаа'
  ) {
    return EXCEL_COLORS.RED_STRONG;
  }
  return EXCEL_COLORS.WHITE;
};

/** Column headers and widths for the daily work-log sheet. */
export const WORKLOG_HEADERS = [
  '№',
  'АЖИЛ',
  'ХҮЛЭЭН АВСАН ЦАГ',
  'ХҮЛЭЭЛГЭЖ ӨГӨХ ХУГАЦАА',
  'ХОЛБОГДОХ УТАС',
  'ХҮРГЭТ-УНААНД ТАВИХ',
  'ТАЙЛБАР',
  'ГҮЙЦЭТГЭЛ',
] as const;

export const WORKLOG_WIDTHS_DAILY = [4, 28, 12, 16, 13, 18, 24, 18] as const;
export const WORKLOG_WIDTHS_MONTHLY = [4, 28, 12, 16, 13, 16, 22, 16] as const;

export const PERFORMANCE_HEADERS = [
  '#',
  'НЭР',
  'ЦАГТАА',
  'ХОЦРОЛ',
  'АЖЛЫН ӨДӨР',
  'ДАДАЛ ОНОО',
  'ХУВЬ',
  'УРАМШУУЛАЛ',
] as const;

export const PERFORMANCE_WIDTHS = [4, 18, 10, 10, 12, 14, 10, 14] as const;
