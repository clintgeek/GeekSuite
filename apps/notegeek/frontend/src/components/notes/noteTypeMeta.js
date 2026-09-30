// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SubjectIcon from '@mui/icons-material/Subject';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DataObjectIcon from '@mui/icons-material/DataObject';
import AccountTreeIcon from '@mui/icons-material/AccountTreeOutlined';
import GestureIcon from '@mui/icons-material/Gesture';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

/**
 * The five note types, in one table, so the rows, filters, editor head and
 * viewer never disagree about a type's name or glyph.
 *
 * Graphite shows a type as a small graphite glyph with an accessible label
 * (TypeIcon.jsx), not as a coloured stamp: the chrome should be quieter than
 * the notes. Markdown is the default note ("Note"); rich text is kept for
 * the notes that already are rich text, but it is not offered as a new type.
 */
export const NOTE_TYPE_META = {
  markdown:    { label: 'Note',      long: 'Note',      aria: 'Markdown note',      Icon: SubjectIcon,     description: 'Markdown, with a preview' },
  text:        { label: 'Rich text', long: 'Rich text', aria: 'Rich text note', Icon: TextFieldsIcon,  description: 'Bold, italic, lists' },
  code:        { label: 'Code',      long: 'Code',      aria: 'Code note',      Icon: DataObjectIcon,  description: 'Snippets in a monospace page' },
  mindmap:     { label: 'Mind map',  long: 'Mind map',  aria: 'Mind map note',  Icon: AccountTreeIcon, description: 'Ideas on a canvas' },
  handwritten: { label: 'Sketch',    long: 'Sketch',    aria: 'Sketch note',    Icon: GestureIcon,     description: 'Draw or write with a pen' },
};

/** Every type, for filters. Rich text last: nobody makes new ones. */
export const NOTE_TYPE_ORDER = ['markdown', 'handwritten', 'code', 'mindmap', 'text'];

/**
 * What the New surfaces offer. `front` is the phone's front door (a note,
 * a photo, a sketch); `more` is behind "More". Text is deliberately absent:
 * a new note is Markdown.
 */
export const NEW_FRONT = ['markdown', 'photo', 'handwritten'];
export const NEW_MORE = ['code', 'mindmap'];

/**
 * "Photo of a page" (DOCS/HANDWRITING.md §3) is not a sixth type: it makes a
 * sketch note (plus a Markdown one). It sits beside the types on the New
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

export function noteTypeMeta(type) {
  if (type === 'photo') return PHOTO_ENTRY;
  if (type === 'import') return IMPORT_ENTRY;
  return NOTE_TYPE_META[type] || NOTE_TYPE_META.text;
}

/** Where a New entry goes. */
export function newNotePath(key) {
  if (key === 'photo') return PHOTO_ENTRY.path;
  if (key === 'markdown') return '/notes/new';
  return `/notes/new?type=${encodeURIComponent(key)}`;
}
