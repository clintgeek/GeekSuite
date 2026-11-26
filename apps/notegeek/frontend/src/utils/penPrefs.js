/**
 * penPrefs.js — what this DEVICE remembers about writing in sketches
 * (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md 2.3, 2.4, 2.11, 2.12), under
 * NoteGeek's own keys. The logic is @geeksuite/ink's `createPenPrefs`
 * (shared with GeekDay, which keeps its own `geekday:ink*` keys).
 *
 *   - penSeen       a pen has drawn here before → pen mode (palm rejection)
 *                   is on from the first touch, not from the first pen stroke
 *   - fingerDraws   the writer's override: fingers draw, pen mode stays off
 *   - barPosition   bottom / top / left / right (handedness)
 *   - camera        where each sketch was last looked at, per note id
 *   - recentPens    the last three pens used (colour + size), a preset strip
 *
 * Per device (localStorage), never in the note. These key strings are stored
 * on devices: never rename them.
 */
import { createPenPrefs } from '@geeksuite/ink';

export const PEN_PREF_KEYS = {
  penSeen: 'notegeek:sketchPenSeen',
  fingerDraws: 'notegeek:sketchFingerDraws',
  barPosition: 'notegeek:sketchBarPosition',
  cameras: 'notegeek:sketchCameras',
  recentPens: 'notegeek:sketchRecentPens',
};

export const {
  readPenSeen, writePenSeen, readFingerDraws, writeFingerDraws, readBarPosition, writeBarPosition,
  readCamera, writeCamera, readRecentPens, pushRecentPen,
} = createPenPrefs(PEN_PREF_KEYS);
