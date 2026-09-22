import type { Announcement } from '@/types';
import { toDateString } from '@/utils/date';
import { nextId } from '@/utils/id';

/**
 * Мэдээлэл — what the manager wants the shop to know.
 *
 * A plan for the day, a change of hours, a customer to watch out for. The shop
 * ran on the chat for this, and a plan posted into a chat is three messages up
 * by the afternoon; here it stays put, and the app can say plainly who has
 * read it.
 *
 * Read state is per *name*, not per device. The shop is four people and the
 * question the manager asks is «has Bat seen it», which a device id cannot
 * answer — the counter iPad is everybody's.
 */

export interface NewAnnouncement {
  title: string;
  body: string;
  by: string;
}

export const validateAnnouncement = (draft: NewAnnouncement): string | null => {
  if (draft.title.trim() === '') return 'Гарчиг оруулна уу.';
  return null;
};

export function createAnnouncement(
  draft: NewAnnouncement,
  now: Date = new Date(),
): Announcement {
  return {
    id: nextId(),
    date: toDateString(now),
    title: draft.title.trim(),
    body: draft.body.trim(),
    by: draft.by,
    at: now.getTime(),
    readBy: [],
  };
}

/** Newest first — a notice loses value by the hour. */
export const newestFirst = (rows: readonly Announcement[]): Announcement[] =>
  [...rows].sort((a, b) => b.at - a.at);

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export const isReadBy = (announcement: Announcement, name: string): boolean =>
  name.trim() !== '' && (announcement.readBy ?? []).some((who) => same(who, name));

/**
 * How many notices this person has not opened.
 *
 * Drives the badge on the bell. Zero when nobody is signed in by name — an
 * unnamed session has no unread of its own, and a badge that never clears is
 * a badge that stops being looked at.
 */
export const unreadCount = (rows: readonly Announcement[], name: string): number =>
  name.trim() === '' ? 0 : rows.filter((row) => !isReadBy(row, name)).length;

/** Marks one notice read, leaving everything else untouched. */
export const markRead = (
  rows: readonly Announcement[],
  id: number,
  name: string,
): Announcement[] => {
  if (name.trim() === '') return [...rows];
  return rows.map((row) => {
    if (row.id !== id || isReadBy(row, name)) return row;
    return { ...row, readBy: [...(row.readBy ?? []), name.trim()] };
  });
};

/** Marks everything read at once — what opening the tab does. */
export const markAllRead = (rows: readonly Announcement[], name: string): Announcement[] =>
  rows.reduce((current, row) => markRead(current, row.id, name), [...rows]);

/** «Бат, Дорж уншсан» — who has seen it, for the manager's side. */
export const readersLabel = (announcement: Announcement): string => {
  const readers = announcement.readBy ?? [];
  return readers.length === 0 ? 'Хэн ч уншаагүй' : `${readers.join(', ')} уншсан`;
};
