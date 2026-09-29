/**
 * AddBox — type, press Enter, done (DOCS/SIMPLE_PLAN.md § "The add box",
 * Identity item 7).
 *
 * The parse preview is the sentence itself: as you type, the parts the parser
 * understood are underlined in place — dates and times in red, #tags and the
 * other modifiers in grey — and a !priority raises the red mark in the box's
 * margin, where it will sit on the row. Anything that does not parse stays
 * plain, so a typo reads as a typo. The grammar is the existing one
 * (utils/parseTaskInput.js) plus plain-word dates.
 *
 * How the underline works: the real <input> paints its text transparent (the
 * caret stays visible) and an aria-hidden copy of the same string, in the same
 * font at the same offset, sits behind it with the understood spans styled.
 *
 * For a screen reader the same information is a sentence
 * (`describeParse`) on `aria-describedby`, and a polite live region says what
 * was added after Enter.
 *
 * Enter adds and keeps focus in the box, so the next task can follow.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box, IconButton, InputBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { HelpCircle } from 'lucide-react';
import { slashFocusProps } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';
import { srOnly } from './penMarks';
import { parseTaskInputDetailed } from '../../utils/parseTaskInput';
import { describeParse, segmentLine, spokenDate, toCreateInput } from '../../utils/quickAdd';
import { localDateString } from '@geeksuite/utils';


const FONT = { fontSize: '1.125rem', lineHeight: '28px', fontWeight: 450, letterSpacing: 'normal' };

export default function AddBox({ onAdd, onHelp, autoFocus = false, now }) {
  const theme = useTheme();
  const p = penOf(theme);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);
  const [value, setValue] = useState('');
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);
  const describeId = useId();
  const clock = useMemo(() => now || new Date(), [now]);

  const parsed = useMemo(() => (value.trim() ? parseTaskInputDetailed(value, { now: clock }) : null), [value, clock]);
  const segments = useMemo(() => (parsed ? segmentLine(value, parsed.spans) : []), [parsed, value]);
  const summary = describeParse(parsed, clock);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const syncScroll = useCallback(() => {
    const el = inputRef.current;
    if (el && overlayRef.current) overlayRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
  }, []);
  useEffect(() => { syncScroll(); }, [value, syncScroll]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !value.trim()) return;
    const detail = parseTaskInputDetailed(value.trim(), { now: new Date() });
    const { input, noteGeekNote } = toCreateInput(detail, { today: new Date() });
    if (!input) {
      setAnnounce('Nothing to add: type some words for the task.');
      return;
    }
    const due = typeof input.dueDate === 'string' ? input.dueDate : localDateString(new Date(input.dueDate));
    const where = due !== localDateString(new Date()) ? spokenDate(detail, new Date()) : null;
    setBusy(true);
    const created = await onAdd?.(input, { noteGeekNote, where });
    setBusy(false);
    if (created === null || created === false) {
      inputRef.current?.focus();
      return;
    }
    setValue('');
    setAnnounce(`Added: ${input.content}${where ? `, for ${where}` : ''}.`);
    inputRef.current?.focus();
  };

  const underline = (kind) => {
    if (!kind) return null;
    const red = kind === 'date';
    return {
      textDecorationLine: 'underline',
      textDecorationColor: red ? p.red : p.grey,
      textDecorationThickness: red ? '2px' : '1.5px',
      textUnderlineOffset: '5px',
      color: red ? p.red : p.ink,
    };
  };

  const kindGlyph = parsed && parsed.signifier && parsed.signifier !== '*' ? parsed.signifier : null;

  return (
    <Box
      component="form"
      onSubmit={submit}
      aria-label="Add a task"
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 5,
        pr: 1,
        minHeight: 56,
        backgroundColor: p.surface,
        border: `1.5px solid ${p.ink}`,
        borderRadius: '4px',
      }}
    >
      {/* The margin: the priority mark and the kind glyph, as they will sit on the row. */}
      {parsed?.priority && (
        <Box
          aria-hidden
          data-add-priority={parsed.priority}
          sx={{
            position: 'absolute', left: 6, width: 3, borderRadius: '2px',
            top: parsed.priority === 1 ? 12 : 21, bottom: parsed.priority === 1 ? 12 : 'auto',
            height: parsed.priority === 1 ? 'auto' : 14,
            backgroundColor: parsed.priority === 3 ? p.box : p.red,
          }}
        />
      )}
      {kindGlyph && (
        <Box aria-hidden sx={{ position: 'absolute', left: 13, top: 14, fontWeight: 600, fontSize: '0.9375rem', color: p.grey }}>
          {kindGlyph}
        </Box>
      )}

      <Box sx={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {value && (
          <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            <Box ref={overlayRef} component="span" data-add-overlay sx={{ ...FONT, whiteSpace: 'pre', color: p.ink }}>
              {segments.map((seg, i) => (
                <Box key={i} component="span" data-kind={seg.kind || undefined} sx={underline(seg.kind)}>
                  {seg.text}
                </Box>
              ))}
            </Box>
          </Box>
        )}
        <InputBase
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onScroll={syncScroll}
          // Escape leaves the box, so the list keys (j k x t d e) work.
          onKeyDown={(e) => { if (e.key === 'Escape' && !value) inputRef.current?.blur(); }}
          onSelect={syncScroll}
          placeholder="Add a task — call Dana tomorrow 2pm #work !high"
          fullWidth
          sx={{
            ...FONT,
            minHeight: 44,
            '& input': {
              p: 0,
              color: value ? 'transparent' : p.ink,
              caretColor: p.ink,
              '&::placeholder': { color: p.muted, opacity: 1 },
            },
          }}
          inputProps={{
            'aria-label': 'New task',
            'aria-describedby': describeId,
            enterKeyHint: 'enter',
            autoComplete: 'off',
            autoCapitalize: 'sentences',
            'data-quickadd': true,
            ...slashFocusProps(30, { select: false }),
          }}
        />
      </Box>
      <IconButton aria-label="How to write a task" onClick={onHelp} sx={{ width: 44, height: 44, color: p.grey }}>
        <HelpCircle size={20} strokeWidth={1.75} />
      </IconButton>

      <Box id={describeId} sx={srOnly}>{summary}</Box>
      <Box role="status" aria-live="polite" sx={srOnly}>{announce}</Box>
    </Box>
  );
}
