/**
 * The Attic's REST calls (same origin, cookie auth — the thinggeek backend
 * is the only holder of the vault key; DOCS/THINGGEEK_PLAN.md "The Attic").
 *
 *   vault      status, set a PIN, unlock (PIN / passkey), passkeys, ping, lock
 *   sealed     reveal ONE identifier, write identifiers (sealed server-side)
 *   files      upload a card side / page (progress), file URLs
 *
 * Responses are `Cache-Control: no-store` and the service worker never
 * caches /api/attic (pwa/runtimeCaching.js). Revealed values live only in
 * the component that asked for them — never in Apollo, storage or a log.
 */
import { csrfHeaders } from '@geeksuite/auth';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { request, ApiError } from './rest';

export const VAULT_LOCKED = 'VAULT_LOCKED';

/** True for the answer a locked Attic gives (REST 423 or a GraphQL VAULT_LOCKED). */
export function isVaultLocked(error) {
  if (!error) return false;
  if (error.code === VAULT_LOCKED || error.status === 423) return true;
  const gql = error.graphQLErrors ?? error.errors ?? [];
  return gql.some((e) => e?.extensions?.code === VAULT_LOCKED);
}

export const vaultStatus = () => request('/attic/vault');
export const pingVault = () => request('/attic/vault/ping', { method: 'POST', body: {} });
export const lockVault = () => request('/attic/vault/lock', { method: 'POST', body: {} });
export const setPin = (pin) => request('/attic/vault/pin', { method: 'POST', body: { pin } });
export const unlockWithPin = (pin) => request('/attic/vault/unlock/pin', { method: 'POST', body: { pin } });
export const removePasskey = (id) => request(`/attic/vault/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function passkeysSupported() {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Register this device's fingerprint / face as a passkey. */
export async function registerPasskey(label = 'This phone') {
  const { options } = await request('/attic/vault/passkeys/options', { method: 'POST', body: {} });
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    throw new ApiError(err?.name === 'NotAllowedError' ? 'The fingerprint step was cancelled.' : 'This device could not make a passkey.', { code: 'PASSKEY_CANCELLED' });
  }
  return request('/attic/vault/passkeys', { method: 'POST', body: { response, label } });
}

/** Unlock with a passkey (the phone asks for the fingerprint / face). */
export async function unlockWithPasskey() {
  const { options } = await request('/attic/vault/unlock/passkey/options', { method: 'POST', body: {} });
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    throw new ApiError(err?.name === 'NotAllowedError' ? 'The fingerprint step was cancelled.' : 'This device could not use its passkey.', { code: 'PASSKEY_CANCELLED' });
  }
  return request('/attic/vault/unlock/passkey', { method: 'POST', body: { response } });
}

/** One identifier's value, decrypted for display (audit-logged server-side). */
export async function revealIdentifier(documentId, key) {
  const res = await request(`/attic/documents/${encodeURIComponent(documentId)}/identifiers/${encodeURIComponent(key)}`);
  return res?.value ?? null;
}

/** Write identifier values: `{ key: 'X123…' | null }` (null clears). Sealed by the server. */
export function saveIdentifiers(documentId, values) {
  return request(`/attic/documents/${encodeURIComponent(documentId)}/identifiers`, { method: 'PUT', body: { values } });
}

export const atticFileUrl = (fileId, { download = false } = {}) => `/api/attic/files/${encodeURIComponent(fileId)}${download ? '?download=1' : ''}`;

/**
 * Upload one card side / page: multipart `file`, `side`, `caption`.
 * XMLHttpRequest for progress (a phone photo on a weak signal needs a bar).
 */
export function uploadAtticFile(documentId, { file, side = 'page', caption = '' }, { onProgress } = {}) {
  const form = new FormData();
  form.append('side', side);
  if (caption) form.append('caption', caption);
  form.append('file', file, file.name || 'attic.jpg');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/attic/documents/${encodeURIComponent(documentId)}/files`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    Object.entries(csrfHeaders('POST')).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data?.message || (xhr.status === 413 ? 'That file is too big. The limit is 25 MB.' : `Upload failed (${xhr.status})`), { status: xhr.status, body: data }));
    };
    xhr.onerror = () => reject(new ApiError('The upload lost its connection. Try again.', { status: 0 }));
    xhr.send(form);
  });
}
