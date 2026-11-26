/**
 * penPrefs.js — what this DEVICE remembers about writing on the day page,
 * under GeekDay's own keys. The logic is @geeksuite/ink's `createPenPrefs`
 * (shared with NoteGeek, which keeps its own `notegeek:sketch*` keys). Only
 * the two prefs the fixed page needs:
 *
 *   - penSeen       a pen has drawn here before → fingers stop drawing
 *   - fingerDraws   the writer's override: fingers draw anyway
 *
 * Per device (localStorage), never in the note. These key strings are stored
 * on devices: never rename them.
 */
import { createPenPrefs } from '@geeksuite/ink';

export const PEN_PREF_KEYS = {
  penSeen: 'geekday:inkPenSeen',
  fingerDraws: 'geekday:inkFingerDraws',
};

export const { readPenSeen, writePenSeen, readFingerDraws, writeFingerDraws } = createPenPrefs(PEN_PREF_KEYS);
