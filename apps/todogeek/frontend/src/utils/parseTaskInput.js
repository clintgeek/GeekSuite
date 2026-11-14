/**
 * The task-line parser lives in `@geeksuite/task-grammar` since 2026-11-14
 * (packages/task-grammar/src/parseTaskInput.js), shared with NoteGeek's
 * handwritten journal lines. This file keeps every existing import working.
 */
export {
  parseTaskInput as default,
  parseTaskInputDetailed,
  buildRecurrenceRule,
  frequencyFromRecurrenceRule,
} from '@geeksuite/task-grammar';
