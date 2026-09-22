import { describe, expect, it } from 'vitest';

import type { Announcement } from '@/types';

import {
  createAnnouncement,
  isReadBy,
  markAllRead,
  markRead,
  newestFirst,
  readersLabel,
  unreadCount,
  validateAnnouncement,
} from './announcementLogic';

const notice = (over: Partial<Announcement>): Announcement => ({
  id: 1,
  date: '2026-09-22',
  title: 'Өнөөдрийн төлөвлөгөө',
  body: '',
  by: 'Менежер',
  at: 1,
  readBy: [],
  ...over,
});

describe('validateAnnouncement', () => {
  it('needs a title, but not a body', () => {
    expect(validateAnnouncement({ title: '', body: 'x', by: 'Менежер' })).toBe(
      'Гарчиг оруулна уу.',
    );
    expect(validateAnnouncement({ title: 'Ээлж солигдов', body: '', by: 'Менежер' })).toBeNull();
  });

  it('does not accept whitespace as a title', () => {
    expect(validateAnnouncement({ title: '   ', body: '', by: 'Менежер' })).not.toBeNull();
  });
});

describe('createAnnouncement', () => {
  it('trims and stamps the day', () => {
    const made = createAnnouncement(
      { title: '  Ээлж  ', body: '  09:00-с  ', by: 'Менежер' },
      new Date('2026-09-22T10:15:00'),
    );
    expect(made.title).toBe('Ээлж');
    expect(made.body).toBe('09:00-с');
    expect(made.date).toBe('2026-09-22');
    expect(made.readBy).toEqual([]);
  });
});

/**
 * Read state is per name, not per device: the counter iPad is everybody's, and
 * a badge that clears because somebody else picked up the shared tablet is a
 * badge nobody trusts.
 */
describe('who has read what', () => {
  const rows = [notice({ id: 1, at: 2 }), notice({ id: 2, at: 1, readBy: ['Бат'] })];

  it('counts what this person has not opened', () => {
    expect(unreadCount(rows, 'Бат')).toBe(1);
    expect(unreadCount(rows, 'Дорж')).toBe(2);
  });

  it('has no unread for an unnamed session', () => {
    // A badge that can never clear is a badge that stops being looked at.
    expect(unreadCount(rows, '')).toBe(0);
    expect(unreadCount(rows, '   ')).toBe(0);
  });

  it('matches a name regardless of case and stray spaces', () => {
    expect(isReadBy(notice({ readBy: [' бат '] }), 'Бат')).toBe(true);
  });

  it('marks one without touching the others', () => {
    const after = markRead(rows, 1, 'Дорж');
    expect(after[0]?.readBy).toEqual(['Дорж']);
    expect(after[1]?.readBy).toEqual(['Бат']);
  });

  it('does not list the same reader twice', () => {
    const twice = markRead(markRead(rows, 1, 'Дорж'), 1, 'Дорж');
    expect(twice[0]?.readBy).toEqual(['Дорж']);
  });

  it('clears the lot when the screen is opened', () => {
    expect(unreadCount(markAllRead(rows, 'Дорж'), 'Дорж')).toBe(0);
  });

  it('newest first — a notice loses value by the hour', () => {
    expect(newestFirst([notice({ id: 1, at: 1 }), notice({ id: 2, at: 9 })])[0]?.id).toBe(2);
  });

  it('says plainly when nobody has read it', () => {
    expect(readersLabel(notice({ readBy: [] }))).toBe('Хэн ч уншаагүй');
    expect(readersLabel(notice({ readBy: ['Бат', 'Дорж'] }))).toBe('Бат, Дорж уншсан');
  });

  it('survives a record written before readBy existed', () => {
    const old = { ...notice({}), readBy: undefined } as Announcement;
    expect(isReadBy(old, 'Бат')).toBe(false);
    expect(markRead([old], 1, 'Бат')[0]?.readBy).toEqual(['Бат']);
  });
});
