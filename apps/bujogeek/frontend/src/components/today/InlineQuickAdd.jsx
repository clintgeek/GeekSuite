import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, InputBase, Typography, useTheme } from '@mui/material';
import { useMutation } from '@apollo/client';
import { colors } from '../../theme/colors';
import { useToast } from '../shared/Toast';
import TaskInputHelpButton from '../tasks/TaskInputHelpButton';
import parseTaskInput from '../../utils/parseTaskInput';
import { CREATE_NOTE } from '../../graphql/notegeekMutations';

/* ---------- tokenizer ---------- */

// Date/time pattern mirrored from parseTaskInput.js PATTERNS.dateTime
const DATE_TIME_RE =
  /\/(today|tomorrow|next-week|next-month|next-(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|(?:\d{4}-\d{2}-\d{2})|(?:\d{2}-\d{2}-\d{4})|(?:\d{2}-\d{2})|(?:\d{1,2})(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap]\.?m\.?))?)?/iy;

const PRIORITY_RE   = /!(high|medium|low)\b/iy;
const TAG_RE        = /#[a-zA-Z0-9_-]+/iy;
const RECURRENCE_RE = /\((daily|weekly|monthly)\)/iy;
// Note/NoteGeek are anchored at end — tested separately before the walk
const NOTE_GEEK_RE  = /\$\^.+$/i;
const NOTE_RE       = /\^.+$/i;
// Signifier only at position 0
const SIGNIFIER_RE  = /[*@\-!?]/y;

/**
 * tokenize(text) → Array<{ text: string, category: string }>
 * category: 'plain' | 'signifier' | 'priority' | 'tag' | 'recurrence' | 'date' | 'note' | 'noteGeek'
 */
function tokenize(text) {
  if (!text) return [];

  const segments = [];

  // 1. Pull off trailing note/noteGeek tokens first (anchored at end).
  //    We capture the suffix and its start index, then tokenize the prefix normally.
  let suffix = null;
  let suffixCategory = null;
  let prefixText = text;

  const ngMatch = text.match(NOTE_GEEK_RE);
  if (ngMatch) {
    suffix = ngMatch[0];
    suffixCategory = 'noteGeek';
    prefixText = text.slice(0, ngMatch.index);
  } else {
    const nMatch = text.match(NOTE_RE);
    if (nMatch) {
      suffix = nMatch[0];
      suffixCategory = 'note';
      prefixText = text.slice(0, nMatch.index);
    }
  }

  // 2. Walk left-to-right through prefixText
  let pos = 0;
  let plain = '';

  const flushPlain = () => {
    if (plain) { segments.push({ text: plain, category: 'plain' }); plain = ''; }
  };

  while (pos < prefixText.length) {
    // Signifier — only at position 0
    if (pos === 0) {
      SIGNIFIER_RE.lastIndex = 0;
      const m = SIGNIFIER_RE.exec(prefixText);
      if (m) {
        // Only treat as a signifier if not the start of !high/!medium/!low
        const isNotPriority = !(prefixText[0] === '!' && /^!(high|medium|low)\b/i.test(prefixText));
        if (isNotPriority) {
          flushPlain();
          segments.push({ text: m[0], category: 'signifier' });
          pos += m[0].length;
          continue;
        }
      }
    }

    // Date/time (try first — longest match)
    DATE_TIME_RE.lastIndex = pos;
    const dtm = DATE_TIME_RE.exec(prefixText);
    if (dtm && dtm.index === pos) {
      flushPlain();
      segments.push({ text: dtm[0], category: 'date' });
      pos += dtm[0].length;
      continue;
    }

    // Priority
    PRIORITY_RE.lastIndex = pos;
    const pm = PRIORITY_RE.exec(prefixText);
    if (pm && pm.index === pos) {
      flushPlain();
      segments.push({ text: pm[0], category: 'priority', level: pm[1].toLowerCase() });
      pos += pm[0].length;
      continue;
    }

    // Tag
    TAG_RE.lastIndex = pos;
    const tm = TAG_RE.exec(prefixText);
    if (tm && tm.index === pos) {
      flushPlain();
      segments.push({ text: tm[0], category: 'tag' });
      pos += tm[0].length;
      continue;
    }

    // Recurrence
    RECURRENCE_RE.lastIndex = pos;
    const rm = RECURRENCE_RE.exec(prefixText);
    if (rm && rm.index === pos) {
      flushPlain();
      segments.push({ text: rm[0], category: 'recurrence' });
      pos += rm[0].length;
      continue;
    }

    // Plain character
    plain += prefixText[pos];
    pos += 1;
  }

  flushPlain();

  // 3. Append suffix (note / noteGeek)
  if (suffix !== null) {
    segments.push({ text: suffix, category: suffixCategory });
  }

  return segments;
}

/* ---------- color map ---------- */

function segmentColor(seg, theme) {
  switch (seg.category) {
    case 'priority':
      return colors.priority[seg.level] ?? colors.priority.medium;
    case 'tag':
      return colors.primary[500];
    case 'recurrence':
      return colors.gold.muted;
    case 'date':
      return colors.signifier.event;
    case 'note':
      return colors.signifier.task;
    case 'noteGeek':
      return colors.primary[600];
    case 'signifier': {
      const map = { '*': 'task', '@': 'event', '-': 'note', '!': 'priority', '?': 'question' };
      return colors.signifier[map[seg.text]] ?? colors.signifier.task;
    }
    default:
      return theme.palette.text.primary;
  }
}

/* ---------- component ---------- */

const InlineQuickAdd = ({ onAdd, autoFocus = false }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef(null);
  const overlayRef = useRef(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const toast = useToast();
  const [createNote] = useMutation(CREATE_NOTE);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [autoFocus]);

  // Sync overlay horizontal scroll with the input element's scroll position
  const syncScroll = useCallback(() => {
    const el = inputRef.current;
    if (!el || !overlayRef.current) return;
    overlayRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener('scroll', syncScroll, { passive: true });
    return () => el.removeEventListener('scroll', syncScroll);
  }, [syncScroll]);

  // Reset scroll sync whenever value changes (cursor may have moved)
  useEffect(() => { syncScroll(); }, [value, syncScroll]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    const parsed = parseTaskInput(trimmed);
    if (!parsed.content) return;

    // Default dueDate to today 9am local when the user doesn't specify one
    if (!parsed.dueDate) {
      const today = new Date();
      today.setHours(9, 0, 0, 0);
      parsed.dueDate = today;
    }

    // If $^ was used, also save a note to NoteGeek
    if (parsed.noteGeekNote) {
      createNote({
        variables: {
          title: parsed.content,
          content: parsed.noteGeekNote,
          type: 'text',
          tags: parsed.tags || [],
        },
      })
        .then(() => toast.success('Note saved to NoteGeek'))
        .catch(() => toast.error('Failed to save note to NoteGeek'));
    }

    // Strip noteGeekNote before passing to task creation
    const { noteGeekNote, ...taskData } = parsed;
    onAdd?.(taskData);

    setValue('');
    // Keep focus after submit — the user is planning, let them keep writing
    inputRef.current?.focus();
  };

  const tokens = value ? tokenize(value) : [];

  return (
    <Box sx={{ pt: { xs: 2.5, sm: 3 }, pb: { xs: 1, sm: 1.5 } }}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        onClick={() => inputRef.current?.focus()}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: { xs: 2, sm: 2.5 },
          borderRadius: '8px',
          backgroundColor: focused
            ? theme.palette.background.paper
            : (isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.warm),
          border: '1.5px solid transparent',
          borderColor: focused
            ? colors.primary[300]
            : 'transparent',
          boxShadow: focused
            ? `0 0 0 3px ${isDark ? 'rgba(96,152,204,0.12)' : colors.primary[50]}`
            : 'none',
          transition: 'all 0.2s ease',
          cursor: 'text',
        }}
      >
        {/* Prompt label — visible only when empty and unfocused */}
        {!focused && !value && (
          <Box sx={{ mb: 0.75 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                fontWeight: 400,
                fontStyle: 'italic',
                color: isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300],
                letterSpacing: '0.01em',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              Plan your day
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Overlay + input wrapper — position:relative so the overlay sits on top */}
          <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
            {/* Syntax-highlight overlay */}
            {value && (
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 1,
                  overflow: 'hidden',
                  // Match InputBase exactly
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Box
                  ref={overlayRef}
                  component="span"
                  sx={{
                    display: 'inline',
                    whiteSpace: 'pre',
                    // Match InputBase typography exactly
                    fontSize: { xs: '1rem', sm: '1.0625rem' },
                    fontWeight: 450,
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    letterSpacing: 'inherit',
                  }}
                >
                  {tokens.map((seg, i) => (
                    <span key={i} style={{ color: segmentColor(seg, theme) }}>
                      {seg.text}
                    </span>
                  ))}
                </Box>
              </Box>
            )}

            <InputBase
              inputRef={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={focused ? 'Write a task\u2026  #tag  !high  /tomorrow  (daily)  ^note' : 'What needs to happen today?'}
              fullWidth
              sx={{
                fontSize: { xs: '1rem', sm: '1.0625rem' },
                fontWeight: 450,
                // Transparent text when overlay is active, but keep caret visible
                color: value ? 'transparent' : theme.palette.text.primary,
                caretColor: theme.palette.text.primary,
                lineHeight: 1.6,
                '& input': {
                  py: 0,
                  color: value ? 'transparent' : theme.palette.text.primary,
                  caretColor: theme.palette.text.primary,
                },
                '& input::placeholder': {
                  color: focused
                    ? (isDark ? 'rgba(255,255,255,0.2)' : colors.ink[300])
                    : (isDark ? 'rgba(255,255,255,0.3)' : colors.ink[400]),
                  opacity: 1,
                  fontWeight: 400,
                },
              }}
              inputProps={{
                'aria-label': 'Add a task for today',
                'data-quickadd': true,
              }}
            />
          </Box>
          <TaskInputHelpButton compact />
        </Box>

        {/* Bottom rule line — like paper */}
        <Box
          sx={{
            mt: 1.5,
            height: '1px',
            background: focused
              ? `linear-gradient(90deg, ${colors.primary[300]}, transparent 80%)`
              : (isDark
                ? 'linear-gradient(90deg, rgba(255,255,255,0.06), transparent 70%)'
                : `linear-gradient(90deg, ${colors.ink[200]}, transparent 70%)`),
            transition: 'all 0.2s ease',
          }}
        />
      </Box>
    </Box>
  );
};

export default InlineQuickAdd;
