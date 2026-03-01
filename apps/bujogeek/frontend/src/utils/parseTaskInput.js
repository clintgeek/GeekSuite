/**
 * Shared task-input parser used by InlineQuickAdd, CommandPalette, and any
 * other surface that accepts a single-line task string.
 *
 * Supported syntax (all case-insensitive):
 *   Signifier (first char):  * (task, default)  @ (event)  - (note)  ? (question)  ! (important)
 *   Priority:                 !high  !medium  !low
 *   Tags:                     #work  #my-tag  (letters, digits, hyphens, underscores)
 *   Note:                     ^some note text  (must be last token)
 *   Date:                     /today  /tomorrow  /next-week  /next-month
 *                             /monday … /sunday  (or /mon … /sun)
 *                             /next-monday … /next-sunday
 *                             /2026-03-15  /03-15-2026  /03-15  /15th
 *                             /mar 5th  /january 15
 *   Time (after a date):      9am  14:30  2:30pm  2 p.m.
 *
 * Returns: { content, signifier, priority, dueDate, tags, note }
 */

const DAY_NAMES = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_NAMES = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/* ---------- helpers ---------- */

function getNextDayOccurrence(targetDay) {
  const today = new Date();
  const current = today.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

function defaultTime(date) {
  date.setHours(9, 0, 0, 0);
  return date;
}

/* ---------- core patterns ---------- */

const PATTERNS = {
  priority: /!(high|medium|low)/i,
  dateTime:
    /\/(today|tomorrow|next-week|next-month|next-(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|(?:\d{4}-\d{2}-\d{2})|(?:\d{2}-\d{2}-\d{4})|(?:\d{2}-\d{2})|(?:\d{1,2})(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap]\.?m\.?))?)?/i,
  timeMarker: /\b([ap]\.?m\.?)\b/i,
  tags: /#([a-zA-Z0-9_-]+)/g,
  type: /[*@\-!?]/,
  note: /\^(.+)$/,
};

/* ---------- main export ---------- */

export default function parseTaskInput(text) {
  let content = text;
  let dueDate = null;
  let priority = null;
  let signifier = null;
  let note = null;
  const tags = [];

  // 1. Tags — extract first so # tokens don't interfere with other parsing
  let tagMatch;
  while ((tagMatch = PATTERNS.tags.exec(content)) !== null) {
    tags.push(tagMatch[1]);
  }
  content = content.replace(/#[a-zA-Z0-9_-]+/g, '').trim();

  // 2. Note — anchored at end
  const noteMatch = content.match(PATTERNS.note);
  if (noteMatch) {
    note = noteMatch[1].trim();
    content = content.replace(noteMatch[0], '').trim();
  }

  // 3. Signifier (first special char)
  const typeMatch = content.match(PATTERNS.type);
  if (typeMatch) {
    signifier = typeMatch[0];
    content = content.replace(typeMatch[0], '').trim();
  } else {
    signifier = '*'; // default = task
  }

  // 4. Priority
  const priorityMatch = content.match(PATTERNS.priority);
  if (priorityMatch) {
    const level = priorityMatch[1].toLowerCase();
    priority = level === 'high' ? 1 : level === 'low' ? 3 : 2;
    content = content.replace(PATTERNS.priority, '').trim();
  }

  // 5. Date + optional time
  const dtMatch = content.match(PATTERNS.dateTime);
  if (dtMatch) {
    const [fullMatch, dateStr, timeStr, minutes, meridian] = dtMatch;
    let date = new Date();
    const dl = dateStr.toLowerCase();

    if (dl === 'today') {
      /* keep today */
    } else if (dl === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    } else if (dl === 'next-week') {
      date.setDate(date.getDate() + 7);
    } else if (dl === 'next-month') {
      date.setMonth(date.getMonth() + 1);
    } else if (dl.startsWith('next-')) {
      const dayName = dl.substring(5);
      const dayNum = DAY_NAMES[dayName];
      if (dayNum !== undefined) date = getNextDayOccurrence(dayNum);
    } else if (DAY_NAMES[dl] !== undefined) {
      date = getNextDayOccurrence(DAY_NAMES[dl]);
    } else {
      const parts = dateStr.split('-');
      if (parts.length === 2) {
        date = defaultTime(new Date(date.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1])));
      } else if (parts.length === 3) {
        if (parts[0].length === 4) {
          date = defaultTime(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        } else {
          date = defaultTime(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
        }
      } else {
        // month-name + day  OR  bare day number
        const monthDayMatch = dl.match(
          /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?$/i,
        );
        if (monthDayMatch) {
          const month = MONTH_NAMES[monthDayMatch[1].toLowerCase()];
          const day = parseInt(monthDayMatch[2]);
          date = defaultTime(new Date(date.getFullYear(), month, day));
        }
        // else: bare number like /15th — handled by regex capture but not assigned a month,
        // so we interpret as the 15th of the current month
        else {
          const bareDay = parseInt(dateStr.replace(/(?:st|nd|rd|th)$/i, ''));
          if (!isNaN(bareDay)) {
            date = defaultTime(new Date(date.getFullYear(), date.getMonth(), bareDay));
          }
        }
      }
    }

    // Time
    if (timeStr) {
      let hours = parseInt(timeStr);
      let mins = minutes ? parseInt(minutes) : 0;
      let mer = meridian?.toLowerCase().replace(/\./g, '');

      if (!mer) {
        const remaining = content.substring(content.indexOf(fullMatch) + fullMatch.length);
        const markerMatch = remaining.match(PATTERNS.timeMarker);
        if (markerMatch) mer = markerMatch[1].toLowerCase().replace(/\./g, '');
      }

      if (mer) {
        if (mer.startsWith('p') && hours < 12) hours += 12;
        else if (mer.startsWith('a') && hours === 12) hours = 0;
      }

      date.setHours(hours, mins, 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }

    dueDate = date;
    content = content.replace(fullMatch, '').trim();
  }

  // Clean up any remaining extra whitespace
  content = content.replace(/\s{2,}/g, ' ').trim();

  return {
    content: content || undefined,
    signifier,
    priority: priority || undefined,
    dueDate: dueDate || undefined,
    tags: tags.length > 0 ? tags : undefined,
    note: note || undefined,
  };
}
