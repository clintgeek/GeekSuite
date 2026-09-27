// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SubjectIcon from '@mui/icons-material/Subject';
import TagIcon from '@mui/icons-material/Tag';
import DataObjectIcon from '@mui/icons-material/DataObject';
import AccountTreeIcon from '@mui/icons-material/AccountTreeOutlined';
import GestureIcon from '@mui/icons-material/Gesture';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';

/**
 * The five note types — NoteGeek's signature. One table, so the home chips,
 * list rows, filters, editor header and viewer can never disagree about a
 * type's name, glyph or colour.
 *
 * Labels are sentence case in the DOM (a screen reader should say
 * "Markdown", not spell M-A-R-K…); the stamp uppercases them with CSS.
 */
export const NOTE_TYPE_META = {
  text:        { label: 'Text',     long: 'Rich text', Icon: SubjectIcon,     description: 'Bold, italic, lists' },
  markdown:    { label: 'Markdown', long: 'Markdown',  Icon: TagIcon,         description: 'Plain text with live preview' },
  code:        { label: 'Code',     long: 'Code',      Icon: DataObjectIcon,  description: 'Snippets in a monospace page' },
  mindmap:     { label: 'Mind map', long: 'Mind map',  Icon: AccountTreeIcon, description: 'Ideas on a canvas' },
  handwritten: { label: 'Sketch',   long: 'Sketch',    Icon: GestureIcon,     description: 'Freehand drawing and notes' },
};

export const NOTE_TYPE_ORDER = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];

/**
 * "Photo of a page" (DOCS/HANDWRITING.md §3) is not a sixth type: it makes a
 * sketch note (plus a Markdown one). So it borrows the sketch's ink, keeps
 * its own glyph, and lives beside the type chips rather than in the table.
 */
export const PHOTO_ENTRY = {
  key: 'photo',
  inkType: 'handwritten',
  label: 'Photo',
  long: 'Photo of a page',
  Icon: PhotoCameraOutlined,
  description: 'Photograph a notebook page and read it into text',
  path: '/notes/photo',
};

export function noteTypeMeta(type) {
  return NOTE_TYPE_META[type] || NOTE_TYPE_META.text;
}

