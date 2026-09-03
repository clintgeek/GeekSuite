import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Box, InputBase, Typography, useTheme } from '@mui/material';
import { Hash } from 'lucide-react';
import { useMutation } from '@apollo/client';
import { colors } from '../../theme/colors';
import TaskInputHelpButton from '../tasks/TaskInputHelpButton';
import parseTaskInput from '../../utils/parseTaskInput';
import useTaskTags from '../../hooks/useTaskTags';
import { CREATE_NOTE } from '../../graphql/notegeekMutations';
import { useToast } from '@geeksuite/ui';

/* ---------- tokenizer ---------- */

// Date/time pattern mirrored from parseTaskInput.js PATTERNS.dateTime
const DATE_TIME_RE =
  /\/(today|tomorrow|next-week|next-month|next-(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|(?:\d{4}-\d{2}-\d{2})|(?:\d{2}-\d{2}-\d{4})|(?:\d{2}-\d{2})|(?:\d{1,2})(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap]\.?m\.?))?)?/iy;

const PRIORITY_RE   = /!(high|medium|low)\b/iy;
const TAG_RE        = /#[a-zA-Z0-9_-]+/iy;
const RECURRENCE_RE = /\((daily|weekly|monthly)\)/iy;
// Note/NoteGeek/blocked are anchored at end — tested separately before the walk.
// Order mirrors parseTaskInput: the note tokens are read first, so a `~blocked`
// written after a `^note` is part of the note (in the parser and here).
const NOTE_GEEK_RE  = /\$\^.+$/i;
const NOTE_RE       = /\^.+$/i;
const BLOCKED_RE    = /~blocked(?:\s+.+)?$/i;
// Signifier only at position 0
const SIGNIFIER_RE  = /[*@\-!?]/y;

/**
 * tokenize(text) → Array<{ text: string, category: string }>
 * category: 'plain' | 'signifier' | 'priority' | 'tag' | 'recurrence' | 'date'
 *          | 'note' | 'noteGeek' | 'blocked'
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
    } else {
      const bMatch = text.match(BLOCKED_RE);
      if (bMatch) {
        suffix = bMatch[0];
        suffixCategory = 'blocked';
        prefixText = text.slice(0, bMatch.index);
      }
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
    case 'blocked':
      return colors.aging.stale;
    case 'signifier': {
      const map = { '*': 'task', '@': 'event', '-': 'note', '!': 'priority', '?': 'question' };
      return colors.signifier[map[seg.text]] ?? colors.signifier.task;
    }
    default:
      return theme.palette.text.primary;
  }
}

/* ---------- component ---------- */

/**
 * InlineQuickAdd — the writing surface. Parses `#tag`, `!priority`,
 * `/date`, `(daily)`, `^note`, `$^noteGeek` and `~blocked [reason]` out of one
 * line of prose. The `blocked` / `blockedReason` fields it emits are a create
 * instruction, not task input: the page that owns `onAdd` creates the task and
 * then parks it (createTask has no blocked input).
 *
 * `collectionId` switches it into collection mode: the entry is filed into that
 * collection and, crucially, is NOT given a default due date — a collection
 * entry stays out of the daily log until the writer dates it themselves.
 */
const InlineQuickAdd = ({
  onAdd,
  autoFocus = false,
  collectionId = null,
  promptLabel,
  placeholder,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef(null);
  const overlayRef = useRef(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const { notify } = useToast();
  const [createNote] = useMutation(CREATE_NOTE);
  const allTags = useTaskTags();

  // ─── Tag autocomplete (#-triggered) ───
  const [caretPos, setCaretPos] = useState(0);
  const [dismissedKey, setDismissedKey] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [anchorX, setAnchorX] = useState(0);
  const measureRef = useRef(null);
  const pendingCaretRef = useRef(null);

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

  const updateCaret = useCallback(() => {
    setCaretPos(inputRef.current?.selectionStart ?? 0);
  }, []);

  // Is the caret inside a (possibly empty) #tag token?
  const activeTag = useMemo(() => {
    if (!value) return null;
    const beforeCaret = value.slice(0, caretPos);
    const m = beforeCaret.match(/#([a-zA-Z0-9_-]*)$/);
    if (!m) return null;
    return { start: caretPos - m[0].length, query: m[1], raw: m[0] };
  }, [value, caretPos]);

  const tagSuggestions = useMemo(() => {
    if (!activeTag) return [];
    const q = activeTag.query.toLowerCase();
    const matches = allTags.filter((t) => {
      const lt = t.toLowerCase();
      return lt.startsWith(q) && lt !== q;
    });
    return (q ? matches : allTags).slice(0, 6);
  }, [activeTag, allTags]);

  const dismissKey = activeTag ? `${activeTag.start}:${activeTag.query}` : null;
  const tagMenuOpen = Boolean(activeTag) && dismissedKey !== dismissKey && tagSuggestions.length > 0;

  // Keep the highlighted suggestion valid
  useEffect(() => {
    setHighlightIndex(0);
  }, [dismissKey]);

  const applyTagSuggestion = useCallback((tag) => {
    if (!activeTag || !tag) return;
    const nextCaret = activeTag.start + tag.length + 2; // '#tag '
    setValue(
      value.slice(0, activeTag.start) + '#' + tag + ' ' + value.slice(caretPos)
    );
    pendingCaretRef.current = nextCaret;
    inputRef.current?.focus();
  }, [activeTag, value, caretPos]);

  // Apply pending caret position after the value update renders
  useEffect(() => {
    if (pendingCaretRef.current != null && inputRef.current) {
      const pos = pendingCaretRef.current;
      pendingCaretRef.current = null;
      inputRef.current.setSelectionRange(pos, pos);
      syncScroll();
    }
  }, [value, syncScroll]);

  // Measure the pixel offset of the '#' so the menu opens at the caret.
  // The hidden mirror span lives inside the syntax overlay (identical typography).
  useLayoutEffect(() => {
    if (measureRef.current) {
      setAnchorX(Math.max(0, Math.min(measureRef.current.offsetWidth, 360)));
    }
  }, [activeTag?.start, value]);

  const handleTagMenuKeyDown = (e) => {
    if (!tagMenuOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % tagSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + tagSuggestions.length) % tagSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyTagSuggestion(tagSuggestions[highlightIndex] || tagSuggestions[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissedKey(dismissKey);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    const parsed = parseTaskInput(trimmed);
    if (!parsed.content) return;

    // Default dueDate to today 9am local when the user doesn't specify one —
    // but never in a collection: an undated collection entry is precisely the
    // point (it stays out of the daily log until it's dated).
    if (!parsed.dueDate && !collectionId) {
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
        .then(() => notify('Note saved to NoteGeek', { tone: 'success' }))
        .catch(() => notify('Failed to save note to NoteGeek', { tone: 'error' }));
    }

    // Strip noteGeekNote before passing to task creation
    const { noteGeekNote, ...taskData } = parsed;
    onAdd?.(collectionId ? { ...taskData, collectionId } : taskData);

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
              {promptLabel || 'Plan your day'}
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
                  {activeTag && (
                    <span
                      ref={measureRef}
                      aria-hidden
                      style={{ visibility: 'hidden', position: 'absolute', whiteSpace: 'pre' }}
                    >
                      {value.slice(0, activeTag.start)}
                    </span>
                  )}
                </Box>
              </Box>
            )}

            <InputBase
              inputRef={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                updateCaret();
              }}
              onKeyDown={handleTagMenuKeyDown}
              onSelect={updateCaret}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                focused
                  ? 'Write a task\u2026  #tag  !high  /tomorrow  (daily)  ^note  ~blocked'
                  : (placeholder || 'What needs to happen today?')
              }
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
                'aria-label': collectionId ? 'Add an entry to this collection' : 'Add a task for today',
                'data-quickadd': true,
              }}
            />

            {/* Tag autocomplete popup — opens at the '#' position */}
            {tagMenuOpen && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: anchorX,
                  zIndex: 20,
                  minWidth: 160,
                  maxWidth: 280,
                  py: 0.5,
                  borderRadius: '8px',
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`,
                  boxShadow: '0 8px 24px rgba(28,20,14,0.14)',
                }}
              >
                {tagSuggestions.map((tag, i) => (
                  <Box
                    key={tag}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyTagSuggestion(tag)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.25,
                      py: 0.75,
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontWeight: i === highlightIndex ? 550 : 450,
                      color: i === highlightIndex ? colors.primary[600] : theme.palette.text.primary,
                      backgroundColor:
                        i === highlightIndex
                          ? (isDark ? 'rgba(96,152,204,0.12)' : colors.primary[50])
                          : 'transparent',
                      '&:hover': { backgroundColor: isDark ? 'rgba(96,152,204,0.12)' : colors.primary[50] },
                    }}
                  >
                    <Hash size={12} style={{ color: colors.primary[500], flexShrink: 0 }} />
                    {tag}
                  </Box>
                ))}
              </Box>
            )}
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
