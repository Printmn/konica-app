import { describe, expect, it } from 'vitest';

import { highestIssued } from './invoiceRegistry';

/**
 * The claim registry is keyed by the number itself, so this reads node names
 * rather than their contents — a half-written claim still counts as taken.
 */
describe('highestIssued', () => {
  it('finds the highest number of the year', () => {
    const remote = { '2026-0001': {}, '2026-0007': {}, '2026-0003': {} };
    expect(highestIssued(remote, '2026')).toBe('2026-0007');
  });

  it('ignores other years', () => {
    const remote = { '2025-9999': {}, '2026-0002': {} };
    expect(highestIssued(remote, '2026')).toBe('2026-0002');
  });

  it('does not let a longer number lose on string order', () => {
    // Plain lexicographic comparison puts '2026-9999' above '2026-10000',
    // which would hand out 10000 a second time.
    const remote = { '2026-9999': {}, '2026-10000': {} };
    expect(highestIssued(remote, '2026')).toBe('2026-10000');
  });

  it('is empty when the year has no invoices yet', () => {
    expect(highestIssued({ '2025-0004': {} }, '2026')).toBe('');
  });

  it('is empty when the registry node does not exist', () => {
    expect(highestIssued(null, '2026')).toBe('');
    expect(highestIssued(undefined, '2026')).toBe('');
  });

  it('survives a registry that is not an object', () => {
    expect(highestIssued('пойнт', '2026')).toBe('');
  });

  it('ignores keys that are not numbers of this shape', () => {
    expect(highestIssued({ 'НХ-14': {}, '2026-0002': {} }, '2026')).toBe('2026-0002');
    expect(highestIssued({ '2026-abc': {}, '2026-0002': {} }, '2026')).toBe('2026-0002');
  });
});
