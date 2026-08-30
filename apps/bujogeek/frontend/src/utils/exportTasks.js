import { format } from 'date-fns';
import { toLocalDateString } from './dateUtils';

// Priority is 1=High, 2=Medium, 3=Low, null/undefined=None (sorts last) —
// matches the app-wide convention documented in context/TaskContext.jsx.
const PRIORITY_NONE = Number.MAX_SAFE_INTEGER;
const priorityRank = (task) => {
  const p = Number(task?.priority);
  return Number.isFinite(p) && p > 0 ? p : PRIORITY_NONE;
};

export function tasksToJSON(tasks) {
  return JSON.stringify(tasks, null, 2);
}

/**
 * Bullet-journal-flavored markdown line for a single task:
 *  - checkbox bullet for actionable signifiers (task '*' / important '!')
 *  - plain signifier-prefixed bullet for events '@' and questions '?'
 *  - plain bullet for notes '-'
 *  - strikethrough content when status is 'cancelled'
 *  - tags rendered as #hashtags
 *  - note rendered as an indented line beneath the bullet
 */
function formatTaskLine(task) {
  const sig = task.signifier || '*';
  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';

  let content = task.content || '';
  if (isCancelled) content = `~~${content}~~`;

  let bullet;
  if (sig === '-') {
    bullet = '-';
  } else if (sig === '@') {
    bullet = '- @';
  } else if (sig === '?') {
    bullet = '- ?';
  } else {
    // '*' (task) and '!' (important) are actionable — checkbox bullet
    bullet = `- [${isCompleted ? 'x' : ' '}]`;
  }

  let line = `${bullet} ${content}`.trim();

  if (task.tags?.length) {
    line += ' ' + task.tags.map((t) => `#${t}`).join(' ');
  }

  const lines = [line];
  if (task.note) {
    lines.push(`    ${task.note}`);
  }
  return lines.join('\n');
}

/**
 * Groups tasks by due date (undated last), formats each group as a
 * markdown section, and returns the full export document.
 */
export function tasksToMarkdown(tasks) {
  const groups = new Map();
  (tasks || []).forEach((task) => {
    const key = task.dueDate ? toLocalDateString(task.dueDate) : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });

  const datedKeys = [...groups.keys()].filter((k) => k !== null).sort();
  const orderedKeys = groups.has(null) ? [...datedKeys, null] : datedKeys;

  const sections = orderedKeys.map((key) => {
    const heading = key
      ? format(new Date(`${key}T00:00:00`), 'EEEE, MMMM d, yyyy')
      : 'No due date';
    const items = [...groups.get(key)].sort((a, b) => priorityRank(a) - priorityRank(b));
    return `## ${heading}\n\n${items.map(formatTaskLine).join('\n')}`;
  });

  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  return `# BuJoGeek Export\n\n_Exported ${today}_\n\n${sections.join('\n\n')}\n`;
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportFilename(extension) {
  return `bujogeek-export-${toLocalDateString(new Date())}.${extension}`;
}
