/**
 * Shared task-input parser used by the add box and any other surface that
 * accepts a single-line task string.
 *
 * Supported syntax (all case-insensitive):
 *   Signifier (first char):  * (task, default)  @ (event)  - (note)  ? (question)  ! (important)
 *   Priority:                 !high  !medium  !low
 *   Tags:                     #work  #my-tag  #home/garage  (the suite tag
 *                             standard, @geeksuite/tags — 2026-10-01: `#` at
 *                             the start or after a space or `(`, then a letter,
 *                             then letters/digits/`_`/`-`/`/`; `/` nests; saved
 *                             kebab-case, so `#GeekSuite` is `geek-suite`. Not
 *                             a tag: `C#`, `a#b`, `#1`.)
 *   Recurrence:               (daily)  (weekly)  (monthly)
 *   Private:                  (private)  — hide the words on a desktop until
 *                             clicked (2026-10-01; see PenRow / PrivacyContext)
 *   Note:                     ^some note text  (must be last token)
 *   NoteGeek note:            $^note text  (saves to NoteGeek; must be last token)
 *   Blocked:                  ~blocked waiting on legal  (the reason is optional
 *                             and must be the last token)
 *   Date:                     /today  /tomorrow  /next-week  /next-month
 *                             /monday … /sunday  (or /mon … /sun)
 *                             /next-monday … /next-sunday
 *                             /2026-03-15  /03-15-2026  /03-15  /15th
 *                             /mar 5th  /january 15
 *   Time (after a date):      9am  14:30  2:30pm  2 p.m.
 *   Plain-word date (2026-09-29, SIMPLE_PLAN Phase 1) — only when no slash
 *   date was given, and only as the FIRST or LAST words of what is left:
 *                             today  tomorrow  monday … sunday
 *                             next week  next month  next monday … next sunday
 *                             optionally with a time after it (2pm, 14:30,
 *                             at 9am) or before it at the end (2pm tomorrow).
 *     At the end it may follow "on", "by" or "due", which go with it. It is
 *     NOT read after "for", "until", "since", "every", "last" and the like —
 *     "tickets for friday" is about Friday, not due on it — nor when it is
 *     the whole task ("Friday"), nor mid-sentence. A clock time has to be
 *     unmistakable: am/pm or hh:mm, never a bare number.
 *
 * The slash forms stay canonical. Days resolve the way the slash forms do:
 * a weekday is its next occurrence AFTER today (`friday` on a Friday is next
 * week's), `next week` is seven days on.
 *
 * The signifier is the FIRST character only (it was the first matching
 * character anywhere, so "Call Bob re: Q3-plan" became a "-" note called
 * "Call Bob re: Q3plan", and "Buy milk?" a question). A leading `!` that
 * begins `!high`/`!medium`/`!low` is the priority, not the signifier.
 *
 * Recurrence is emitted as an RRULE string only — the legacy
 * `recurrencePattern` enum is no longer produced by any surface.
 *
 * `~blocked` and `^note` both anchor at the end of the line, so only one of
 * them can be the trailing token: `^note` is read first and would swallow a
 * `~blocked` that came after it.
 *
 * ## How it reads the line
 *
 * Every token is matched against the ORIGINAL line with the tokens already
 * read blanked out to spaces, so indices never move. That is what lets
 * `parseTaskInputDetailed` report where each understood part sits in the
 * sentence (the add box underlines them in place), and it reads the same as
 * the old remove-and-trim walk because every pattern that spans a gap does so
 * with `\s+`.
 *
 * Returns: { content, signifier, priority, dueDate, hasTime, tags, note,
 *            noteGeekNote, recurrenceRule, blocked, blockedReason, private }
 */

import { findTagTokens } from '@geeksuite/tags';

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

function getNextDayOccurrence(targetDay, now = new Date()) {
  const current = now.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}

function defaultTime(date) {
  date.setHours(9, 0, 0, 0);
  return date;
}

/* ---------- recurrence (RRULE) ---------- */

const FREQ_BY_WORD = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };

/**
 * Format a Date as an iCalendar UTC timestamp: `20260315T090000Z`.
 */
function formatDtstart(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build the canonical RRULE string the API's expansion code parses:
 *
 *   DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY
 *
 * @param {string} freq      'daily' | 'weekly' | 'monthly' (anything else → null)
 * @param {Date}   startDate DTSTART anchor; defaults to today at 09:00 local
 * @returns {string|null}
 */
export function buildRecurrenceRule(freq, startDate) {
  const FREQ = FREQ_BY_WORD[String(freq ?? '').toLowerCase()];
  if (!FREQ) return null;
  const start = startDate ? new Date(startDate) : defaultTime(new Date());
  if (isNaN(start.getTime())) return null;
  return `DTSTART:${formatDtstart(start)}\nRRULE:FREQ=${FREQ}`;
}

/**
 * Inverse of buildRecurrenceRule — read the frequency word back out of an
 * RRULE so an editor can pre-select it. Returns 'none' when there is no rule.
 */
export function frequencyFromRecurrenceRule(rule) {
  const match = String(rule ?? '').match(/FREQ=(DAILY|WEEKLY|MONTHLY)/i);
  return match ? match[1].toLowerCase() : 'none';
}

/* ---------- core patterns ---------- */

const PATTERNS = {
  recurrence: /\((daily|weekly|monthly)\)/i,
  private: /\(private\)/gi,
  priority: /!(high|medium|low)\b/i,
  dateTime:
    /\/(today|tomorrow|next-week|next-month|next-(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|(?:\d{4}-\d{2}-\d{2})|(?:\d{2}-\d{2}-\d{4})|(?:\d{2}-\d{2})|(?:\d{1,2})(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap]\.?m\.?))?)?/i,
  timeMarker: /\b([ap]\.?m\.?)\b/i,
  type: /^[*@\-!?]/,
  noteGeek: /\$\^(.+)$/,
  note: /\^(.+)$/,
  blocked: /~blocked(?:\s+(.+))?$/i,
};

/* ---------- plain-word dates ---------- */

const WEEKDAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const PLAIN_DATE = `(today|tomorrow|next\\s+week|next\\s+month|(?:next\\s+)?${WEEKDAY})`;
// am/pm, or hh:mm. Never a bare number: "call 3 people tomorrow" is not 3am.
const PLAIN_TIME = '((?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s*[ap]\\.?m\\.?)?|(?:1[0-2]|0?[1-9])\\s*[ap]\\.?m\\.?)';

const PLAIN_END_DATE_FIRST = new RegExp(
  `(?:^|\\s)((?:(?:on|by|due)\\s+)?${PLAIN_DATE}(?:\\s+(?:at\\s+)?${PLAIN_TIME})?)\\s*$`, 'i');
const PLAIN_END_TIME_FIRST = new RegExp(
  `(?:^|\\s)((?:at\\s+)?${PLAIN_TIME}\\s+(?:on\\s+)?${PLAIN_DATE})\\s*$`, 'i');
const PLAIN_START = new RegExp(
  `^(\\s*)(${PLAIN_DATE}(?:\\s+(?:at\\s+)?${PLAIN_TIME})?)[,:]?(?=\\s)`, 'i');

// A date word after one of these is ABOUT that day, not due on it.
const NOT_A_DUE_DATE_AFTER = new Set([
  'for', 'until', 'till', 'til', 'since', 'after', 'before', 'from', 'of', 'about',
  'every', 'each', 'last', 'this', 'past', 'than', 'the', 'a', 'to', 'into', 'through',
]);

function resolvePlainDay(word, now) {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  const d = new Date(now);
  if (w === 'today') return d;
  if (w === 'tomorrow') { d.setDate(d.getDate() + 1); return d; }
  if (w === 'next week') { d.setDate(d.getDate() + 7); return d; }
  if (w === 'next month') { d.setMonth(d.getMonth() + 1); return d; }
  const day = DAY_NAMES[w.replace(/^next /, '')];
  return day === undefined ? null : getNextDayOccurrence(day, now);
}

function applyClock(date, clock) {
  const m = String(clock).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?/);
  if (!m) return false;
  let hours = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3] === 'p' && hours < 12) hours += 12;
  else if (m[3] === 'a' && hours === 12) hours = 0;
  date.setHours(hours, mins, 0, 0);
  return true;
}

/**
 * Find a plain-word date at the start or end of `masked` (the line with every
 * token already read blanked out). Returns { start, end, date, hasTime } in
 * line indices, or null.
 */
function findPlainDate(masked, now) {
  const leftover = (start, end) => (masked.slice(0, start) + masked.slice(end)).trim();

  const tryEnd = (re, dateGroup, timeGroup) => {
    const m = masked.match(re);
    if (!m) return null;
    const whole = m[1];
    const start = m.index + m[0].indexOf(whole);
    const end = start + whole.length;
    const before = masked.slice(0, start).trim().split(/\s+/).pop()?.toLowerCase() ?? '';
    if (NOT_A_DUE_DATE_AFTER.has(before)) return null;
    if (!leftover(start, end)) return null;
    return { start, end, word: m[dateGroup], clock: m[timeGroup] };
  };

  let hit = tryEnd(PLAIN_END_TIME_FIRST, 3, 2) || tryEnd(PLAIN_END_DATE_FIRST, 2, 3);

  if (!hit) {
    const m = masked.match(PLAIN_START);
    if (m) {
      const start = m[1].length;
      const end = start + m[0].length - m[1].length;
      if (leftover(start, end)) hit = { start, end, word: m[3], clock: m[4] };
    }
  }
  if (!hit) return null;

  const date = resolvePlainDay(hit.word, now);
  if (!date) return null;
  const hasTime = hit.clock ? applyClock(date, hit.clock) : false;
  if (!hasTime) defaultTime(date);
  return { start: hit.start, end: hit.end, date, hasTime };
}

/* ---------- main export ---------- */

/**
 * Parse one line, and say WHERE each understood part is.
 *
 * @param {string} text
 * @param {{ now?: Date }} [options] `now` anchors relative dates (tests pass one)
 * @returns the `parseTaskInput` fields plus `spans`: Array<{ start, end, kind }>
 *   in line order, kind ∈ signifier | priority | tag | date | recurrence |
 *   private | note | noteGeek | blocked.
 */
export function parseTaskInputDetailed(text, { now = new Date() } = {}) {
  const line = String(text ?? '');
  let masked = line;
  const spans = [];
  const take = (start, end, kind) => {
    spans.push({ start, end, kind });
    masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end);
  };
  const tidy = (s) => s.replace(/\s{2,}/g, ' ').trim();

  let dueDate = null;
  let hasTime = false;
  let priority = null;
  let signifier = null;
  let note = null;
  let noteGeekNote = null;
  let blocked = false;
  let blockedReason = null;
  let recurrenceFreq = null;
  let isPrivate = false;
  const tags = [];

  // 0. Recurrence — (daily) / (weekly) / (monthly). The RRULE itself is built
  //    at the end, once the due date (its DTSTART anchor) has been parsed.
  const recurrenceMatch = masked.match(PATTERNS.recurrence);
  if (recurrenceMatch) {
    recurrenceFreq = recurrenceMatch[1].toLowerCase();
    take(recurrenceMatch.index, recurrenceMatch.index + recurrenceMatch[0].length, 'recurrence');
  }

  // 0b. Private — `(private)`, anywhere, the same parenthesised shape as the
  //     repeats. Every copy is read (typing it twice is still one flag) so
  //     none is left behind as words. Read before the note, like the repeats,
  //     so it may sit after a ^note and still count without becoming note text.
  for (const m of [...masked.matchAll(PATTERNS.private)]) {
    isPrivate = true;
    take(m.index, m.index + m[0].length, 'private');
  }

  // 1. Tags — first, so # tokens don't interfere with other parsing (a
  //    nested `#home/garage` is never half-read as a `/date`). The suite's
  //    one `#tag` reader (`@geeksuite/tags`), normalized; the span covers the
  //    token as WRITTEN, so the underline sits under `#GeekSuite` while the
  //    tag saved is `geek-suite`. Hex colours are not a thing in a task line:
  //    `#add`, `#cafe` are tags here.
  for (const t of findTagTokens(masked, { hexColours: false })) {
    if (!tags.includes(t.tag)) tags.push(t.tag);
    take(t.start, t.end, 'tag');
  }

  // 2a. NoteGeek note ($^) — before the plain note, which would half-match it.
  const noteGeekMatch = masked.match(PATTERNS.noteGeek);
  if (noteGeekMatch) {
    noteGeekNote = tidy(noteGeekMatch[1]) || null;
    take(noteGeekMatch.index, line.length, 'noteGeek');
  }

  // 2b. Note — anchored at end.
  const noteMatch = !noteGeekMatch && masked.match(PATTERNS.note);
  if (noteMatch) {
    note = tidy(noteMatch[1]) || null;
    take(noteMatch.index, line.length, 'note');
  }

  // 2c. Blocked — `~blocked` with an optional reason, anchored at the end.
  //     After the note tokens (which share the anchor) and before priority,
  //     so a reason may contain `!high` without being torn apart.
  const blockedMatch = masked.match(PATTERNS.blocked);
  if (blockedMatch) {
    blocked = true;
    blockedReason = blockedMatch[1] ? tidy(blockedMatch[1]) || null : null;
    take(blockedMatch.index, blockedMatch.index + blockedMatch[0].length, 'blocked');
  }

  // 3. Priority — before the signifier so `!high` isn't read as `!` + "high".
  const priorityMatch = masked.match(PATTERNS.priority);
  if (priorityMatch) {
    const level = priorityMatch[1].toLowerCase();
    priority = level === 'high' ? 1 : level === 'low' ? 3 : 2;
    take(priorityMatch.index, priorityMatch.index + priorityMatch[0].length, 'priority');
  }

  // 4. Date + optional time — before the signifier so a leading `/2026-…`
  //    hyphen is never a candidate.
  const dtMatch = masked.match(PATTERNS.dateTime);
  if (dtMatch) {
    const [fullMatch, dateStr, timeStr, minutes, meridian] = dtMatch;
    let date = new Date(now);
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
      const dayNum = DAY_NAMES[dl.substring(5)];
      if (dayNum !== undefined) date = getNextDayOccurrence(dayNum, now);
    } else if (DAY_NAMES[dl] !== undefined) {
      date = getNextDayOccurrence(DAY_NAMES[dl], now);
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
        } else {
          // A bare number like /15th is the 15th of the current month.
          const bareDay = parseInt(dateStr.replace(/(?:st|nd|rd|th)$/i, ''));
          if (!isNaN(bareDay)) {
            date = defaultTime(new Date(date.getFullYear(), date.getMonth(), bareDay));
          }
        }
      }
    }

    let end = dtMatch.index + fullMatch.length;
    if (timeStr) {
      let hours = parseInt(timeStr);
      const mins = minutes ? parseInt(minutes) : 0;
      let mer = meridian?.toLowerCase().replace(/\./g, '');

      if (!mer) {
        const markerMatch = masked.slice(end).match(PATTERNS.timeMarker);
        if (markerMatch) mer = markerMatch[1].toLowerCase().replace(/\./g, '');
      }

      if (mer) {
        if (mer.startsWith('p') && hours < 12) hours += 12;
        else if (mer.startsWith('a') && hours === 12) hours = 0;
      }

      date.setHours(hours, mins, 0, 0);
      hasTime = true;
    } else {
      date.setHours(9, 0, 0, 0);
    }
    // The regex's optional `\s*` before a meridian can end on a trailing
    // space; the underline should stop at the last character of the token.
    while (end > dtMatch.index && /\s/.test(line[end - 1])) end -= 1;

    dueDate = date;
    take(dtMatch.index, end, 'date');
  }

  // 4b. Plain-word date — only when the slash grammar gave none.
  if (!dueDate) {
    const plain = findPlainDate(masked, now);
    if (plain) {
      dueDate = plain.date;
      hasTime = plain.hasTime;
      take(plain.start, plain.end, 'date');
    }
  }

  // 5. Signifier — the first character of what is left, and only that.
  const lead = masked.search(/\S/);
  if (lead >= 0 && PATTERNS.type.test(masked.slice(lead))) {
    signifier = masked[lead];
    take(lead, lead + 1, 'signifier');
  } else {
    signifier = '*'; // default = task
  }

  const content = tidy(masked);

  // 6. Recurrence → RRULE, anchored on the due date when one was given.
  const recurrenceRule = buildRecurrenceRule(recurrenceFreq, dueDate);

  spans.sort((a, b) => a.start - b.start);

  return {
    content: content || undefined,
    signifier,
    priority: priority || undefined,
    dueDate: dueDate || undefined,
    hasTime: (dueDate && hasTime) || undefined,
    tags: tags.length > 0 ? tags : undefined,
    note: note || undefined,
    noteGeekNote: noteGeekNote || undefined,
    recurrenceRule: recurrenceRule || undefined,
    blocked: blocked || undefined,
    blockedReason: blockedReason || undefined,
    private: isPrivate || undefined,
    spans,
  };
}

export default function parseTaskInput(text, options) {
  // eslint-disable-next-line no-unused-vars
  const { spans, ...fields } = parseTaskInputDetailed(text, options);
  return fields;
}
