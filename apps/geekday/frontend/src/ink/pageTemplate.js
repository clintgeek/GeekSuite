/**
 * pageTemplate.js — which printed layout a day's page has
 * (DOCS/TEMPLATES_SPEC.md P3, P4, P7).
 *
 * The templates themselves are @geeksuite/ui's (shared with NoteGeek). A
 * page's choice is stored in its own tldraw document meta under
 * PAPER_TEMPLATE_META_KEY, beside NoteGeek's `paperColor` / `paperPattern`,
 * so it travels with the note. "Ruled" is GeekDay's plain page: no template.
 *
 *   stored id is a template          → that template
 *   stored id is 'none'              → ruled, on purpose
 *   stored id is anything else       → ruled, and the id is left as it is (P7)
 *   nothing stored, page has ink     → ruled: it was written on a ruled page,
 *                                      and a later change of the device's
 *                                      default must not print a schedule
 *                                      under old writing
 *   nothing stored, page is blank    → this device's default for new days
 *
 * Pure helpers; the menu is PageMenu.jsx.
 */
import { PAPER_TEMPLATES, PAPER_TEMPLATE_META_KEY, PAPER_TEMPLATE_NONE, isPaperTemplate } from '@geeksuite/ui';
import { readPref, writePref } from './penPrefs';

/** GeekDay's plain ruled page: no printed template. */
export const RULED = PAPER_TEMPLATE_NONE;
export const TEMPLATE_PREF_KEY = 'geekday:pageTemplate';

/** What the Page menu offers, in order. */
export const PAGE_CHOICES = [
  { id: RULED, label: 'Ruled', description: 'Plain ruled lines', tiles: true },
  ...PAPER_TEMPLATES,
];

const isChoice = (id) => id === RULED || isPaperTemplate(id);

/** This device's page for new days; ruled when nothing (or nonsense) is stored. */
export function readDeviceTemplate() {
  const saved = readPref(TEMPLATE_PREF_KEY);
  return isChoice(saved) ? saved : RULED;
}

export function writeDeviceTemplate(id) {
  if (!isChoice(id)) return;
  writePref(TEMPLATE_PREF_KEY, id === RULED ? null : id);
}

/** The id stored with the page, exactly as stored; null when there is none. */
export function storedTemplate(meta) {
  const id = meta?.[PAPER_TEMPLATE_META_KEY];
  return typeof id === 'string' && id ? id : null;
}

/**
 * The page to draw.
 * @returns {string} one of PAGE_CHOICES' ids
 */
export function resolveTemplate({ stored = null, hasInk = false, deviceDefault = RULED } = {}) {
  if (stored) return isPaperTemplate(stored) ? stored : RULED;
  if (hasInk) return RULED;
  return isChoice(deviceDefault) ? deviceDefault : RULED;
}

/** `meta` with this page's choice written in; every other key is kept. */
export function withTemplate(meta, id) {
  return { ...(meta || {}), [PAPER_TEMPLATE_META_KEY]: isChoice(id) ? id : RULED };
}

/**
 * The first ink on a page that never chose: should the template it was
 * written on be kept with it? Returns the id to store, or null.
 */
export function templateToKeep({ stored, shown }) {
  return !stored && isPaperTemplate(shown) ? shown : null;
}

export const choiceFor = (id) => PAGE_CHOICES.find((c) => c.id === id) || PAGE_CHOICES[0];
