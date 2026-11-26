// Deep-import (see MarkdownEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SubjectIcon from '@mui/icons-material/Subject';
import GestureIcon from '@mui/icons-material/Gesture';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import { MEETING_PATH } from '../../utils/oneOnOne';

/**
 * The two note types, in one table, so the rows, filters, editor head and
 * viewer never disagree about a type's name or glyph.
 *
 * Graphite shows a type as a small graphite glyph with an accessible label
 * (TypeIcon.jsx), not as a coloured stamp: the chrome should be quieter than
 * the notes.
 *
 * The names (Chef, 2026-11-25): a note is Typed or Handwritten. "Sketch"
 * said a drawing; the pen is mostly for writing, and a handwritten note is
 * not a lesser kind. `long` is what the New surfaces call starting one.
 */
export const NOTE_TYPE_META = {
  markdown:    { label: 'Typed',       long: 'Type a note',   aria: 'Typed note',       Icon: SubjectIcon, description: 'With the keyboard, in Markdown' },
  handwritten: { label: 'Handwritten', long: 'Write by hand', aria: 'Handwritten note', Icon: GestureIcon, description: 'With the pen: writing, and drawing too' },
};

/**
 * Every type a note can be, for filters. A note read from the server may still
 * carry a type that is no longer offered (text, code, mindmap): it is a
 * Markdown note, so anything that reads `note.type` goes through this.
 */
export const NOTE_TYPE_ORDER = ['markdown', 'handwritten'];
export const normalizeNoteType = (type) => (type === 'handwritten' ? 'handwritten' : 'markdown');

/**
 * What the New surfaces offer first. A phone is typed on, so typing leads;
 * a tablet is written on with the pen, so writing does (`NEW_FRONT_PEN`).
 */
export const NEW_FRONT = ['markdown', 'photo', 'handwritten'];
export const NEW_FRONT_PEN = ['handwritten', 'markdown', 'photo'];

/**
 * "Photo of a page" (DOCS/HANDWRITING.md §3) is not a sixth type: it makes a
 * handwritten note (plus a typed one). It sits beside the types on the New
 * surfaces with its own glyph and route.
 */
export const PHOTO_ENTRY = {
  key: 'photo',
  inkType: 'handwritten',
  label: 'Photo',
  long: 'Photo of a page',
  aria: 'Photo of a page',
  Icon: PhotoCameraOutlined,
  description: 'Photograph a notebook page and read it into text',
  path: '/notes/photo',
};

/**
 * "Import a Markdown file" (DOCS/CONTEXT.md §9): not a type either — each
 * file becomes a Markdown note. It opens the importer's file picker
 * (store/importStore.js) instead of a route.
 */
export const IMPORT_ENTRY = {
  key: 'import',
  label: 'Import',
  long: 'Import a Markdown file',
  aria: 'Import a Markdown file',
  Icon: UploadFileOutlined,
  description: '.md or .txt, one note per file',
};

/**
 * The two pages written every day, on the New surfaces beside the types
 * (Chef, 2026-11-24: the typed templates are gone; these two stay). Neither
 * is a type: both are a handwritten note on a printed sheet. A 1:1 asks who first
 * (store/oneOnOneStore.js, DOCS/ONE_ON_ONE_SPEC.md req 1); a meeting opens
 * straight on the Meeting sheet (utils/oneOnOne.js MEETING_PATH).
 */
export const ONE_ON_ONE_ENTRY = {
  key: 'one-on-one',
  inkType: 'handwritten',
  label: '1:1',
  long: '1:1',
  aria: 'New 1:1',
  Icon: ForumOutlined,
  description: 'Pick a person: a handwritten page with what is still open',
};
export const MEETING_ENTRY = {
  key: 'meeting',
  inkType: 'handwritten',
  label: 'Meeting',
  long: 'Meeting notes',
  aria: 'New meeting notes',
  Icon: GroupsOutlined,
  description: 'A handwritten page: attendees, agenda, notes and actions',
  path: MEETING_PATH,
};
/** In the order the New surfaces list them, after the front-door types. */
export const NEW_PAGES = [ONE_ON_ONE_ENTRY.key, MEETING_ENTRY.key];

export function noteTypeMeta(type) {
  if (type === 'photo') return PHOTO_ENTRY;
  if (type === 'import') return IMPORT_ENTRY;
  if (type === ONE_ON_ONE_ENTRY.key) return ONE_ON_ONE_ENTRY;
  if (type === MEETING_ENTRY.key) return MEETING_ENTRY;
  return NOTE_TYPE_META[normalizeNoteType(type)];
}

/** Where a New entry goes. */
export function newNotePath(key) {
  if (key === 'photo') return PHOTO_ENTRY.path;
  if (key === MEETING_ENTRY.key) return MEETING_ENTRY.path;
  if (key === 'markdown') return '/notes/new';
  return `/notes/new?type=${encodeURIComponent(key)}`;
}
