/**
 * pageTemplate.js — a day page's PAPER and its TEMPLATE. Two separate things
 * (Chef, 2026-11-21: "the template should be separate than the paper type ...
 * the template should then become a permanent part of the page with a forced
 * white paper under").
 *
 * PAPER is the background: Ruled, Dot grid or Grid, all the way down the
 * page, in GeekDay's own paper colour. Its id is stored in the sketch's
 * tldraw document meta under PAPER_TEMPLATE_META_KEY ('none' | 'dots' |
 * 'grid'), beside NoteGeek's `paperColor` / `paperPattern`.
 *
 *   stored id is 'dots' or 'grid'     → that paper
 *   stored id is 'none'               → ruled, on purpose
 *   stored id is anything else        → ruled, and the id is left as it is.
 *                                       That includes 'schedule', 'top3',
 *                                       'meeting' and 'cornell': the build of
 *                                       2026-11-20 kept layouts here. They are
 *                                       no longer backgrounds.
 *   nothing stored, page has content  → ruled: it was written on a ruled page
 *   nothing stored, page is blank     → this device's paper for new days
 *
 * A TEMPLATE is a layout (Schedule, Top three, Meeting, Cornell) printed INTO
 * the drawing: one locked image shape on a white sheet, made by
 * @geeksuite/ui's `placePaperSheet` and shared with NoteGeek. Nothing about
 * it is stored in meta; the shape is the record. On a blank day that has
 * never been saved, this device's template for new days is shown as a preview
 * and really placed when the first ink lands.
 *
 * Pure helpers; the menu is PageMenu.jsx.
 */
import {
  PAPER_SHEET_TEMPLATES, PAPER_TEMPLATES, PAPER_TEMPLATE_META_KEY, PAPER_TEMPLATE_NONE, isPaperSheetTemplate,
} from '@geeksuite/ui';
import { readPref, writePref } from './penPrefs';

/** GeekDay's plain ruled paper. */
export const RULED = PAPER_TEMPLATE_NONE;
/** The Template menu's "no template". Never stored anywhere. */
export const NO_SHEET = 'none';

/** This device's paper for new days. (The key predates the split; see readDeviceSheet.) */
export const TEMPLATE_PREF_KEY = 'geekday:pageTemplate';
/** This device's template for new days. */
export const SHEET_PREF_KEY = 'geekday:pageSheet';

/** The papers the Page menu offers, in order. */
export const PAPER_CHOICES = [
  { id: RULED, label: 'Ruled', description: 'Plain ruled lines' },
  ...PAPER_TEMPLATES.filter((t) => t.tiles).map(({ id, label, description }) => ({ id, label, description })),
];

/** The templates the Page menu offers, in order. */
export const SHEET_CHOICES = [
  { id: NO_SHEET, label: 'No template', description: 'Just the paper' },
  ...PAPER_SHEET_TEMPLATES.map(({ id, label, description }) => ({ id, label, description })),
];

const paperIds = new Set(PAPER_CHOICES.map((c) => c.id));
export const isPaper = (id) => typeof id === 'string' && paperIds.has(id);
const isSheetChoice = (id) => id === NO_SHEET || isPaperSheetTemplate(id);

export const paperChoiceFor = (id) => PAPER_CHOICES.find((c) => c.id === id) || PAPER_CHOICES[0];
export const sheetChoiceFor = (id) => SHEET_CHOICES.find((c) => c.id === id) || SHEET_CHOICES[0];

/** This device's paper for new days; ruled when nothing (or anything else) is stored. */
export function readDevicePaper() {
  const saved = readPref(TEMPLATE_PREF_KEY);
  return isPaper(saved) ? saved : RULED;
}

export function writeDevicePaper(id) {
  if (!isPaper(id)) return;
  // A layout left under the old key is this device's TEMPLATE default
  // (readDeviceSheet): moved to its own key before this one is rewritten.
  const before = readPref(TEMPLATE_PREF_KEY);
  if (isPaperSheetTemplate(before) && readPref(SHEET_PREF_KEY) === null) writePref(SHEET_PREF_KEY, before);
  writePref(TEMPLATE_PREF_KEY, id === RULED ? null : id);
}

/**
 * This device's template for new days, or NO_SHEET.
 *
 * The build of 2026-11-20 kept one default under TEMPLATE_PREF_KEY, layouts
 * included. A layout still there is read as the template default, so a device
 * that was set to "Schedule" that night still opens new days with one.
 */
export function readDeviceSheet() {
  const saved = readPref(SHEET_PREF_KEY);
  if (isSheetChoice(saved)) return saved;
  const legacy = readPref(TEMPLATE_PREF_KEY);
  return isPaperSheetTemplate(legacy) ? legacy : NO_SHEET;
}

export function writeDeviceSheet(id) {
  if (!isSheetChoice(id)) return;
  // NO_SHEET is written out, not removed: removing it would let a layout
  // under the old key come back as the default.
  writePref(SHEET_PREF_KEY, id);
}

/** The id stored with the page, exactly as stored; null when there is none. */
export function storedTemplate(meta) {
  const id = meta?.[PAPER_TEMPLATE_META_KEY];
  return typeof id === 'string' && id ? id : null;
}

/**
 * The paper to draw.
 * @param {object} page
 * @param {string|null} page.stored      the id in the document's meta
 * @param {boolean} page.hasContent      the page has ink or a template sheet
 * @param {string} page.deviceDefault    this device's paper for new days
 * @returns {string} one of PAPER_CHOICES' ids
 */
export function resolvePaper({ stored = null, hasContent = false, deviceDefault = RULED } = {}) {
  if (stored) return isPaper(stored) ? stored : RULED;
  if (hasContent) return RULED;
  return isPaper(deviceDefault) ? deviceDefault : RULED;
}

/** `meta` with this page's paper written in; every other key is kept. */
export function withPaper(meta, id) {
  return { ...(meta || {}), [PAPER_TEMPLATE_META_KEY]: isPaper(id) ? id : RULED };
}

/**
 * The first ink (or template) on a page that never chose a paper: should the
 * paper it was written on be kept with it? Returns the id to store, or null.
 */
export function paperToKeep({ stored, shown }) {
  return !stored && isPaper(shown) && shown !== RULED ? shown : null;
}

/**
 * The template to show as a preview, or null: only on a day that is blank
 * and has never been saved, and only until the writer says "No template".
 */
export function previewSheet({ hasInk = false, sheet = null, hasBody = false, dismissed = false, deviceDefault = NO_SHEET } = {}) {
  if (hasInk || sheet || hasBody || dismissed) return null;
  return isPaperSheetTemplate(deviceDefault) ? deviceDefault : null;
}
