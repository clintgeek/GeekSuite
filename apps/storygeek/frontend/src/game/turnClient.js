/**
 * The client half of the turn lifecycle (SUITE_REVIEW_2026-11 items 4, 5 and
 * 11; the server half is backend/src/services/turnLockService.js).
 *
 * clientId — every turn carries one, minted when the player sends and KEPT
 * when the same words are sent again. The server answers a repeat with the
 * turn it already produced, so a resend after a timeout can never play the
 * action twice.
 *
 * The composer draft — what the player has typed and not had accepted yet,
 * in localStorage through @geeksuite/ui's draft helpers (the same storage
 * `useUnsavedGuard`'s draftKey uses), written on every change so it survives
 * Back, a reload, an evicted PWA and the session-end redirect. While a turn
 * is in flight the draft holds its words AND its clientId: a page that died
 * mid-turn asks the server whether that turn landed before it offers the
 * words back. Cleared when a turn is accepted.
 */
import { clearGeekDraft, readGeekDraft, writeGeekDraft } from '@geeksuite/ui';

export const composerDraftKey = (storyId) => `storygeek:composer:${storyId}`;

/** A fresh turn id: letters, digits and dashes (the server's clientId shape). */
export function newClientId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* not a secure context */ }
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `t-${Date.now().toString(36)}-${rand()}${rand()}`;
}

/** `{ text, clientId }` or null. */
export function readComposerDraft(storyId) {
  if (!storyId) return null;
  const value = readGeekDraft(composerDraftKey(storyId));
  if (!value || typeof value !== 'object' || typeof value.text !== 'string' || !value.text) return null;
  return { text: value.text, clientId: typeof value.clientId === 'string' ? value.clientId : null };
}

export function writeComposerDraft(storyId, { text, clientId = null }) {
  if (!storyId) return;
  if (!text || !String(text).trim()) {
    clearGeekDraft(composerDraftKey(storyId));
    return;
  }
  writeGeekDraft(composerDraftKey(storyId), { text, clientId: clientId || null });
}

export function clearComposerDraft(storyId) {
  if (storyId) clearGeekDraft(composerDraftKey(storyId));
}

/** The server's "another turn is being written" answer (409). */
export const isTurnInProgress = (err) =>
  err?.response?.status === 409 && (err?.serverCode === 'TURN_IN_PROGRESS' || err?.response?.data?.error?.code === 'TURN_IN_PROGRESS');

/**
 * A failure that says nothing about whether the server saved the turn: no
 * answer at all (timeout, dropped connection, the phone locked) or a gateway
 * that gave up waiting (502/503/504). A 4xx is a definite "no".
 */
export function isAmbiguousFailure(err) {
  const status = err?.response?.status;
  if (!status) return true;
  return status >= 500;
}

/** Poll delays while waiting out a turn: quick at first, then easing off (the API allows 100 requests / 15 min). */
export const TURN_WAIT_DELAYS_MS = Object.freeze([3000, 5000, 8000, 12000, 15000, 20000]);
export const turnWaitDelay = (attempt) =>
  TURN_WAIT_DELAYS_MS[Math.min(attempt, TURN_WAIT_DELAYS_MS.length - 1)];
