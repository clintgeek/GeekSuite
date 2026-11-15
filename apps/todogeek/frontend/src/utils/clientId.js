/**
 * clientId.js — the client's own id for one create (contract C1, 2026-11-15).
 *
 * Made once per thing typed and REUSED on every retry of it, so the gateway
 * can answer a retried create with the task the first attempt made instead of
 * a duplicate.
 */
export function newClientId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default newClientId;
