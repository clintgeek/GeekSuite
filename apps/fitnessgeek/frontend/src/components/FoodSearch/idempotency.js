/**
 * One `Idempotency-Key` per press of Log it (CONTRACTS C2). `randomUUID`
 * needs a secure context, so there is a v4-shaped fallback for the rare
 * browser without it.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default newIdempotencyKey;
