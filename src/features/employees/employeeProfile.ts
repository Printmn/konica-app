import type { Employee } from '@/types';
import { todayString } from '@/utils/date';

/**
 * The staff profile — the few personal details a print shop actually needs.
 *
 * Modelled on what an HR system keeps, cut down hard. A shop of three or four
 * people needs to phone somebody, know when it is their birthday, and know who
 * to call if a guillotine takes a finger. Everything else an HR product offers
 * — payroll self-service, appraisal cycles, training records — is weight.
 *
 * All fields are optional. The roster predates them, and a profile nobody has
 * filled in must not make an employee unusable.
 */

/** `2024-03-15` → how long they have been here, in Mongolian. */
export function tenureLabel(startDate: string | undefined, today: string = todayString()): string {
  const months = tenureMonths(startDate, today);
  if (months === null) return '';

  const years = Math.floor(months / 12);
  const rest = months % 12;

  if (years === 0 && rest === 0) return 'Энэ сар нэгдсэн';
  if (years === 0) return `${rest} сар`;
  if (rest === 0) return `${years} жил`;
  return `${years} жил ${rest} сар`;
}

/**
 * Whole months worked, or `null` when the date is missing or unreadable.
 *
 * Counts completed months rather than rounding: someone who started on the
 * 30th has not worked a month until the 30th comes round again, and a shop
 * that pays by length of service will be asked to defend the arithmetic.
 */
export function tenureMonths(
  startDate: string | undefined,
  today: string = todayString(),
): number | null {
  const start = parseDate(startDate);
  const now = parseDate(today);
  if (start === null || now === null) return null;
  // A start date in the future is a typo, not a negative tenure.
  if (start.getTime() > now.getTime()) return 0;

  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Their birthday this year, as `MM-DD`, or `''` when unknown. */
export const birthdayKey = (birthDate: string | undefined): string =>
  parseDate(birthDate) === null ? '' : (birthDate ?? '').slice(5);

/** True on the day itself — the one thing anybody checks a birth date for. */
export const isBirthdayToday = (
  birthDate: string | undefined,
  today: string = todayString(),
): boolean => {
  const key = birthdayKey(birthDate);
  return key !== '' && key === today.slice(5);
};

/** `2026-08-04` → `2026 оны 8 сарын 4`. Empty for anything unreadable. */
export function longDate(date: string | undefined): string {
  const parsed = parseDate(date);
  if (parsed === null) return '';
  return `${parsed.getFullYear()} оны ${parsed.getMonth() + 1} сарын ${parsed.getDate()}`;
}

/** The editable half of a profile — everything except identity and rota. */
export type ProfileDraft = Pick<
  Employee,
  'phone' | 'birthDate' | 'address' | 'emergencyName' | 'emergencyPhone' | 'startDate' | 'photo'
>;

export const emptyProfile = (): ProfileDraft => ({
  phone: '',
  birthDate: '',
  address: '',
  emergencyName: '',
  emergencyPhone: '',
  startDate: '',
  photo: '',
});

export const profileOf = (employee: Employee | undefined): ProfileDraft => ({
  phone: employee?.phone ?? '',
  birthDate: employee?.birthDate ?? '',
  address: employee?.address ?? '',
  emergencyName: employee?.emergencyName ?? '',
  emergencyPhone: employee?.emergencyPhone ?? '',
  startDate: employee?.startDate ?? '',
  photo: employee?.photo ?? '',
});

/**
 * Writes a draft back onto the roster.
 *
 * Blank fields are stored as empty strings rather than dropped, so clearing a
 * phone number actually clears it instead of leaving the old one in Firebase.
 */
export const applyProfile = (employees: readonly Employee[], id: number, draft: ProfileDraft) =>
  employees.map((employee) => (employee.id === id ? { ...employee, ...draft } : employee));

/** How complete a profile is, for the "fill this in" nudge. */
export function missingFields(employee: Employee | undefined): string[] {
  const labels: [keyof ProfileDraft, string][] = [
    ['phone', 'утас'],
    ['birthDate', 'төрсөн өдөр'],
    ['emergencyPhone', 'яаралтай холбоо'],
    ['startDate', 'ажилд орсон огноо'],
  ];
  return labels.filter(([key]) => !(employee?.[key] ?? '').trim()).map(([, label]) => label);
}

/** `YYYY-MM-DD` → a local `Date`, or `null`. Never `Date.parse`, which is UTC. */
function parseDate(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (match === null) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Rejects 2026-02-31, which `Date` would silently roll into March.
  return date.getMonth() === Number(month) - 1 ? date : null;
}
