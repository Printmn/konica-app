/**
 * Record ids.
 *
 * The web build stamped every new row with a bare `Date.now()`, which is not
 * unique: two rows created in the same millisecond — a bulk import, a fast
 * double tap, a loop — end up sharing an id. Real data in `/pmn/inventory`
 * still carries the result, and it matters more now than it used to: an id is
 * the Firebase child path, so a collision means one row overwrites the other.
 *
 * This keeps the millisecond timestamp (records stay roughly sortable by
 * creation, and old ids remain comparable) but never returns the same value
 * twice within a session.
 */

let lastIssued = 0;

export function nextId(): number {
  const now = Date.now();
  lastIssued = now > lastIssued ? now : lastIssued + 1;
  return lastIssued;
}
