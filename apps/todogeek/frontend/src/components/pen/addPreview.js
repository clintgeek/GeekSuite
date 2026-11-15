/**
 * addPreview.js — the add box's one grey line under the field: what the line
 * was understood to mean, in a few words ("tomorrow at 2pm · #work · high").
 * Empty until the line has words of its own.
 */
import { spokenDate } from '../../utils/quickAdd';

const PRIORITY_WORD = { 1: 'high', 2: 'medium', 3: 'low' };
const KIND_WORD = { '@': 'event', '-': 'note', '?': 'question', '!': 'important' };

/**
 * @param {object|null} parsed  parseTaskInputDetailed's result
 * @param {Date} now
 * @returns {string}
 */
export function previewLine(parsed, now = new Date()) {
  if (!parsed?.content) return '';
  const parts = [];
  const kind = KIND_WORD[parsed.signifier];
  if (kind) parts.push(kind);
  parts.push(parsed.dueDate ? spokenDate(parsed, now) : 'today');
  if (parsed.recurrenceRule) parts.push('repeats');
  const tags = [...(parsed.tags || []).map((t) => `#${t}`), ...(parsed.blocked ? ['#blocked'] : [])];
  if (tags.length) parts.push(tags.join(' '));
  if (parsed.priority) parts.push(PRIORITY_WORD[parsed.priority]);
  if (parsed.private) parts.push('private');
  if (parsed.noteGeekNote) parts.push('+ NoteGeek note');
  else if (parsed.note) parts.push('with a note');
  return parts.join(' · ');
}
