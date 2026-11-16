/**
 * newsArticles' paging cursor (SUITE_REVIEW_2026-11 NewsGeek finding 3).
 *
 * The list is sorted `{ publishedAt: -1, _id: -1 }`, but the original cursor
 * (`before: Date` / `nextBefore`) carried only the timestamp and asked for
 * `publishedAt < before`. Feeds publish at one-second resolution and batch
 * publishers (NWS alerts, press releases) share a second, so a story with
 * exactly the boundary timestamp that did not fit on the page was never shown.
 *
 * The compound cursor names the last row's place in the sort — its
 * `publishedAt` AND its `_id` — so the next page starts strictly after it:
 *
 *   publishedAt < t  OR  (publishedAt = t AND _id < id)
 *
 * On the wire it is an opaque string (`cursor` in, `nextCursor` out); clients
 * hand it back untouched. The old `before`/`nextBefore` pair still works the
 * old way for clients that predate it (the schema change is additive).
 *
 * Shape (private to this module): `<epoch ms>.<24-hex ObjectId>`.
 */
import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';

const CURSOR_RE = /^(\d{1,15})\.([0-9a-f]{24})$/;

const bad = () => new GraphQLError('cursor is not a cursor this server issued', { extensions: { code: 'BAD_USER_INPUT' } });

/** The cursor for a row: its place in the `{ publishedAt: -1, _id: -1 }` sort. */
export function encodeCursor(row) {
  if (!row?.publishedAt || !row?._id) return null;
  return `${new Date(row.publishedAt).getTime()}.${String(row._id)}`;
}

/** `{ t: Date, id: ObjectId }`, or a BAD_USER_INPUT error for anything else. */
export function decodeCursor(cursor) {
  const m = typeof cursor === 'string' ? CURSOR_RE.exec(cursor) : null;
  if (!m) throw bad();
  const ms = Number(m[1]);
  if (!Number.isSafeInteger(ms)) throw bad();
  return { t: new Date(ms), id: new mongoose.Types.ObjectId(m[2]) };
}

/** Mongo clause: the rows strictly after the cursor in the newest-first sort. */
export function afterCursorClause({ t, id }) {
  return { $or: [{ publishedAt: { $lt: t } }, { publishedAt: t, _id: { $lt: id } }] };
}

/**
 * Was `article` at or before the cursor in the sort — i.e. on an earlier
 * page? (The compound form of the old `publishedAt >= before`.)
 */
export function isAtOrBeforeCursor(article, { t, id }) {
  const ms = new Date(article.publishedAt).getTime();
  const tm = t.getTime();
  if (ms !== tm) return ms > tm;
  return String(article._id) >= String(id);
}
