/**
 * Merge a partial update into an existing Mongoose subdocument.
 *
 * `{ ...subdoc, ...update }` looks obviously right and is obviously wrong: a
 * Mongoose document's own enumerable properties are its internals
 * (`$__`, `_doc`, `__parentArray`, `__index`, `$__parent`) — the schema
 * fields live behind prototype getters over `_doc`. Spread one into a
 * DocumentArray slot and the cast keeps nothing but what the update itself
 * supplied, so a partial PUT silently resets the record to schema defaults
 * (and then throws at `save()` if any of the erased fields were `required`).
 *
 * `toObject()` first, then spread, is the merge the caller meant. `_id` and
 * any timestamps come along, so the element keeps its identity.
 *
 * Plain objects pass straight through, which keeps it usable against test
 * fixtures that aren't real documents.
 */
export function mergeSubdocument(existing, update = {}) {
  const fields =
    existing && typeof existing.toObject === 'function'
      ? existing.toObject()
      : existing;
  return { ...(fields || {}), ...update };
}

export default { mergeSubdocument };
