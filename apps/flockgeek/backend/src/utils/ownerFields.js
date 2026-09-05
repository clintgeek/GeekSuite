// BURN_REVIEW #4 / #18: ownership must come only from the authenticated
// caller (req.ownerId, derived in authMiddleware.js from the SSO session),
// never from the request body. Every create/update controller in this
// backend builds its Mongoose payload by spreading req.body — convenient,
// but it means a caller who includes `ownerId` (or a same-shaped alias) in
// the body can mint a record under someone else's account, or reassign an
// existing one on update.
//
// `withoutOwnerFields` is the one place that strips those fields before a
// body is merged into a `create`/`findOneAndUpdate` call. Every
// create/update handler in this backend should route req.body through it.
const OWNER_FIELD_ALIASES = ["ownerId", "owner_id", "owner", "userId", "user_id", "_id"];

/**
 * Return a shallow copy of `body` with every ownership-controlling field
 * stripped. Safe to call on `undefined`/`null` (returns `{}`).
 *
 * @param {object} [body]
 * @returns {object}
 */
export function withoutOwnerFields(body) {
  const clean = { ...(body || {}) };
  for (const field of OWNER_FIELD_ALIASES) {
    delete clean[field];
  }
  return clean;
}
