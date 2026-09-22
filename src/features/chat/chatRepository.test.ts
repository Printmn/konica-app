import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/types';

import { isOwnMessage } from './chatRepository';

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: '1',
  sender: 'Менежер',
  text: 'сайн уу',
  time: '10:00',
  at: 1754400000000,
  deviceId: 'device-a',
  image: null,
  ...over,
});

/**
 * Deciding whose bubble is whose. Getting this wrong is not cosmetic: an
 * unrecognised message sits on the wrong side, loses its delete button, and
 * counts towards the unread badge — so your own message notifies you.
 */
describe('isOwnMessage', () => {
  it('recognises a message sent from this very device', () => {
    expect(isOwnMessage(message({}), 'device-a', 'Менежер')).toBe(true);
  });

  it('recognises your own message after signing in on a second device', () => {
    // The original failure: same person, new phone, new random device id.
    expect(isOwnMessage(message({ deviceId: 'device-a' }), 'device-b', 'Менежер')).toBe(true);
  });

  it('recognises your history again after a reinstall', () => {
    // A reinstall mints a fresh device id; the sender name is what survives.
    expect(isOwnMessage(message({ deviceId: 'old-install' }), 'new-install', 'Менежер')).toBe(
      true,
    );
  });

  it('still recognises this device even after the role changed', () => {
    expect(isOwnMessage(message({ sender: 'iPad' }), 'device-a', 'Менежер')).toBe(true);
  });

  it('treats another person’s message as theirs', () => {
    expect(isOwnMessage(message({ sender: 'Болд', deviceId: 'device-b' }), 'device-a', 'Менежер')).toBe(
      false,
    );
  });

  it('does not claim everything before the device id has loaded', () => {
    expect(isOwnMessage(message({ sender: 'Болд' }), '', 'Менежер')).toBe(false);
  });

  it('does not match on an empty name, which would claim malformed rows', () => {
    expect(isOwnMessage(message({ sender: '' }), 'device-b', '')).toBe(false);
  });

  it('is exact about names rather than fuzzy', () => {
    expect(isOwnMessage(message({ sender: 'Менежер ' }), 'device-b', 'Менежер')).toBe(false);
    expect(isOwnMessage(message({ sender: 'менежер' }), 'device-b', 'Менежер')).toBe(false);
  });
});

/**
 * Two people signed in under the same display name used to see each other's
 * messages as their own — right-aligned, with a delete button on them. The
 * shared worker PIN made that easy to hit: sign in without typing a name and
 * everybody is «Ажилтан».
 */
describe('isOwnMessage does not trust a name two people can share', () => {
  it('claims what this device sent', () => {
    expect(
      isOwnMessage(message({ sender: 'Ажилтан', deviceId: 'phone-A' }), 'phone-A', 'Ажилтан'),
    ).toBe(true);
  });

  it('does not claim another handset signed in as the generic «Ажилтан»', () => {
    // Two nameless worker sessions are two people wearing one name. Each used
    // to see the other's messages as their own, with a delete button on them.
    expect(
      isOwnMessage(message({ sender: 'Ажилтан', deviceId: 'phone-B' }), 'phone-A', 'Ажилтан'),
    ).toBe(false);
  });

  it('still trusts a real name across devices — a reinstall keeps its history', () => {
    expect(isOwnMessage(message({ sender: 'Бат', deviceId: 'old' }), 'new', 'Бат')).toBe(true);
  });

  it('will not claim a nameless legacy row either', () => {
    // «Ажилтан» with no device id identifies nobody at all.
    expect(
      isOwnMessage(message({ sender: 'Ажилтан', deviceId: '' }), 'phone-A', 'Ажилтан'),
    ).toBe(false);
  });

  it('claims nothing on a device with no id and no name', () => {
    expect(isOwnMessage(message({ sender: 'Ажилтан', deviceId: '' }), '', '')).toBe(false);
  });
});
