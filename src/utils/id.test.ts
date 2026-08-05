import { describe, expect, it } from 'vitest';

import { nextId } from './id';

describe('nextId', () => {
  it('never repeats, even in a tight loop within one millisecond', () => {
    // The failure this replaces: `Date.now()` called twice in the same tick
    // returns the same number, so two records collided on one Firebase key.
    const ids = Array.from({ length: 5000 }, () => nextId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('increases monotonically, keeping records roughly ordered by creation', () => {
    const ids = Array.from({ length: 100 }, () => nextId());
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]!).toBeGreaterThan(ids[i - 1]!);
    }
  });

  it('stays in the timestamp range, so old ids remain comparable', () => {
    const id = nextId();
    expect(id).toBeGreaterThan(Date.now() - 60_000);
    expect(id).toBeLessThan(Date.now() + 60_000);
  });
});
