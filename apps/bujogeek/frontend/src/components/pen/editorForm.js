/**
 * editorForm.js — the inline editor's form model: a task in, form values out,
 * and back to only the fields that changed (see InlineEditor.jsx).
 */
import { format } from 'date-fns';
import { hasDueTime, dueDayKey } from '../../utils/dueDate';
import { buildRecurrenceRule, frequencyFromRecurrenceRule } from '../../utils/parseTaskInput';

export const PRIORITIES = [
  { value: '', label: 'None' },
  { value: '3', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '1', label: 'High' },
];

export const parseTagText = (text) => {
  const seen = new Set();
  return String(text ?? '')
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter((t) => {
      if (!t || !/^[a-zA-Z0-9_-]+$/.test(t) || seen.has(t.toLowerCase())) return false;
      seen.add(t.toLowerCase());
      return true;
    });
};

export const isRepeating = (task) => Boolean(task?.recurrenceRule || task?.seriesId || String(task?.id ?? '').startsWith('virtual_'));

/** The form's starting values for a task. */
export function initialForm(task) {
  const timed = hasDueTime(task?.dueDate);
  return {
    content: task?.content || '',
    date: dueDayKey(task?.dueDate),
    time: timed ? format(new Date(task.dueDate), 'HH:mm') : '',
    tags: (task?.tags || []).map((t) => `#${t}`).join(' '),
    priority: task?.priority ? String(task.priority) : '',
    note: task?.note || '',
    repeat: frequencyFromRecurrenceRule(task?.recurrenceRule),
  };
}

/** The due date the form describes: null, `yyyy-MM-dd`, or an ISO instant. */
export function formDueDate({ date, time }) {
  if (!date) return null;
  if (!time) return date;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Only what changed, in updateTask's field names. */
export function changedFields(task, form) {
  const start = initialForm(task);
  const out = {};
  if (form.content.trim() !== start.content) out.content = form.content.trim();
  if (form.date !== start.date || form.time !== start.time) out.dueDate = formDueDate(form);
  const tags = parseTagText(form.tags);
  if (tags.join(' ') !== parseTagText(start.tags).join(' ')) out.tags = tags;
  if (form.priority !== start.priority) out.priority = form.priority ? Number(form.priority) : null;
  if (form.note.trim() !== start.note.trim()) out.note = form.note.trim() || null;
  if ('recurrenceRule' in (task || {}) && isRepeating(task) && form.repeat !== start.repeat) {
    const anchor = formDueDate(form);
    out.recurrenceRule = buildRecurrenceRule(form.repeat, anchor ? new Date(anchor.length === 10 ? `${anchor}T09:00:00` : anchor) : undefined);
  }
  return out;
}
