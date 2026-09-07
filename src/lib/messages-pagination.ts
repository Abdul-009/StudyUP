// Cursor-based pagination for chat history (group Message + DirectMessage).
//
// History is walked newest-first, one page at a time. A cursor is the
// (createdAt, id) of the oldest message the client currently holds; the next
// page is everything strictly older than it. `id` is the tiebreaker so two
// messages sharing a millisecond `createdAt` can't straddle a page boundary
// (and can't be skipped or served twice).
//
// This module is plain TS — safe to import from both server actions and
// `"use server"` files (which may only *export* async functions) and from
// client components.

export const MESSAGE_PAGE_SIZE = 50;

// Hard ceiling so a hostile/oversized `limit` can't ask for the whole table.
export const MESSAGE_PAGE_MAX = 100;

export type MessageCursor = { createdAt: string; id: string };

export function clampLimit(limit: number | undefined | null): number {
  if (!limit || !Number.isFinite(limit)) return MESSAGE_PAGE_SIZE;
  return Math.max(1, Math.min(MESSAGE_PAGE_MAX, Math.floor(limit)));
}

// `createdAt` is an ISO timestamp (no "__"), so a plain delimiter is safe.
export function encodeMessageCursor(row: MessageCursor): string {
  return `${row.createdAt}__${row.id}`;
}

export function decodeMessageCursor(
  cursor: string | null | undefined,
): MessageCursor | null {
  if (!cursor) return null;
  const sep = cursor.lastIndexOf("__");
  if (sep === -1) return null;
  const createdAt = cursor.slice(0, sep);
  const id = cursor.slice(sep + 2);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

// PostgREST `or=` filter selecting rows strictly older than the cursor, matching
// an `ORDER BY createdAt DESC, id DESC` walk: earlier timestamp, OR same
// timestamp with a smaller id.
export function olderThanCursorFilter(cursor: MessageCursor): string {
  return `createdAt.lt.${cursor.createdAt},and(createdAt.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}
