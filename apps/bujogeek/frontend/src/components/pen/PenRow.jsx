/**
 * PenRow — one task, Red Pen style (DOCS/SIMPLE_PLAN.md § "A task row",
 * Identity items 3–6).
 *
 *   [margin]  [□]  words #tag #tag                       9am
 *
 * - The margin carries the proofreader's marks: a red bar for priority (full
 *   height High, half Medium, grey half Low) and, for non-task kinds only, the
 *   bujo glyph in grey. A plain task shows nothing there.
 * - The square is the checkbox. Ticking it fills it red and draws the strike
 *   through the words (see penMarks.js); the words then grey.
 * - Right-hand side: the time, "tomorrow", a weekday — grey — or, when it is
 *   late, red words ("2 days late").
 * - Tapping the words opens the inline editor below the row.
 * - Desktop (a real hover): done / tomorrow / pick-a-date buttons appear on
 *   hover or keyboard focus. Phone: swipe right for done, left for tomorrow,
 *   a long swipe left to pick a date (hooks/useSwipe.js).
 */
import { memo, useId } from 'react';
import { Box, ButtonBase, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ArrowRight, CalendarDays, Check } from 'lucide-react';
import { useReducedMotion } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';
import { STRIKE_MS, TICK_PATH, srOnly, strikeImage } from './penMarks';
import useSwipe from '../../hooks/useSwipe';
import { isDone, whenLabel } from '../../utils/penViews';

const KIND = {
  '@': 'Event',
  '-': 'Note',
  '?': 'Question',
  '!': 'Important',
};
const PRIORITY = { 1: 'High priority', 2: 'Medium priority', 3: 'Low priority' };


export function PenCheckbox({ checked, label, onClick, motion = true }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <ButtonBase
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      sx={{
        width: 44, height: 44, flexShrink: 0, borderRadius: '4px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -4 },
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 20, height: 20, borderRadius: '2px', display: 'block',
          border: `1.5px solid ${checked ? p.red : p.box}`,
          backgroundColor: checked ? p.red : 'transparent',
          transition: motion ? 'background-color 120ms ease, border-color 120ms ease' : 'none',
        }}
      >
        <Box component="svg" viewBox="0 0 20 20" width={17} height={17} sx={{ display: 'block', m: '0.5px' }}>
          <path
            d={TICK_PATH}
            fill="none"
            stroke={p.onRed}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: checked ? 1 : 0, transition: motion ? `opacity 80ms ease ${checked ? 60 : 0}ms` : 'none' }}
          />
        </Box>
      </Box>
    </ButtonBase>
  );
}

function PriorityMark({ priority, p }) {
  if (!priority) return null;
  const high = priority === 1;
  return (
    <Box
      aria-hidden
      data-priority-mark={priority}
      sx={{
        position: 'absolute', left: 2, width: 3, borderRadius: '2px',
        top: high ? 10 : 16, bottom: high ? 10 : 'auto', height: high ? 'auto' : 14,
        backgroundColor: priority === 3 ? p.box : p.red,
      }}
    />
  );
}

const HoverAction = ({ label, onClick, children }) => (
  <Tooltip title={label} enterDelay={400}>
    <IconButton aria-label={label} onClick={onClick} sx={{ width: 40, height: 40, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
      {children}
    </IconButton>
  </Tooltip>
);

function PenRow({
  task,
  now,
  context = 'list',
  crossed = false,
  focused = false,
  expanded = false,
  editor = null,
  onToggleExpand,
  onDone,
  onTomorrow,
  onPickDate,
  showTags = true,
}) {
  const theme = useTheme();
  const p = penOf(theme);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reducedMotion = useReducedMotion();
  const motion = !reducedMotion;
  const editorId = useId();
  const id = String(task.id ?? task._id);
  const done = crossed || isDone(task);
  const cancelled = task.status === 'cancelled';
  const when = context === 'done' ? { text: cancelled ? 'cancelled' : '' } : whenLabel(task, now, context);
  const kind = KIND[task.signifier];
  const swipe = useSwipe({
    enabled: !canHover && !expanded,
    onDone: () => onDone?.(task),
    onTomorrow: () => onTomorrow?.(task),
    onPick: () => onPickDate?.(task),
  });

  const pending = swipe.pending;
  const reveal = swipe.dx > 0 ? 'left' : swipe.dx < 0 ? 'right' : null;
  const revealLabel = swipe.dx > 0
    ? (isDone(task) ? 'Not done' : 'Done')
    : pending === 'pick' ? 'Pick a date' : 'Tomorrow';

  return (
    <Box
      component="li"
      data-row-id={id}
      data-crossed={crossed ? 'true' : undefined}
      sx={{ listStyle: 'none', position: 'relative', borderBottom: `1px solid ${p.rule}` }}
    >
      {/* What a swipe will do, revealed behind the row as it moves. */}
      {reveal && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: reveal === 'left' ? 'flex-start' : 'flex-end',
            px: 5, fontWeight: 700, fontSize: '0.9375rem',
            backgroundColor: reveal === 'left' ? p.red : p.ink,
            color: reveal === 'left' ? p.onRed : p.paper,
            opacity: pending ? 1 : 0.55,
          }}
        >
          {revealLabel}
        </Box>
      )}

      <Box
        {...swipe.handlers}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          pl: { xs: 4, sm: 5 },
          pr: 1,
          minHeight: 52,
          backgroundColor: focused || expanded ? p.fill : p.paper,
          boxShadow: focused ? `inset 2px 0 0 ${p.ink}` : 'none',
          transform: swipe.dx ? `translateX(${swipe.dx}px)` : 'none',
          transition: swipe.dragging || !motion ? 'none' : 'transform 160ms ease',
          touchAction: 'pan-y',
          '@media (hover: hover)': {
            '&:hover': { backgroundColor: p.fill },
            '&:hover [data-row-actions], &:focus-within [data-row-actions]': { opacity: 1 },
          },
        }}
      >
        <PriorityMark priority={task.priority} p={p} />
        {kind && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute', left: { xs: 6, sm: 8 }, top: 13, width: 11, textAlign: 'center',
              fontSize: '0.875rem', fontWeight: 600, lineHeight: '24px', color: p.grey,
            }}
          >
            {task.signifier}
          </Box>
        )}

        <PenCheckbox
          checked={done && !cancelled}
          motion={motion}
          label={`${done ? 'Not done' : 'Done'}: ${task.content}`}
          onClick={() => onDone?.(task)}
        />

        <ButtonBase
          onClick={() => onToggleExpand?.(task)}
          aria-expanded={expanded}
          aria-controls={expanded ? editorId : undefined}
          sx={{
            flex: 1, minWidth: 0, minHeight: 44, py: 2.5, pl: 1, pr: 2,
            display: 'block', textAlign: 'left', borderRadius: '4px',
            '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -2 },
          }}
        >
          <Box
            component="span"
            data-words
            sx={{
              fontSize: '1.0625rem', lineHeight: '26px', fontWeight: 450,
              color: done ? p.muted : p.ink,
              overflowWrap: 'anywhere',
              textDecorationLine: cancelled ? 'line-through' : 'none',
              textDecorationColor: p.muted,
              // The strike: a hand-drawn SVG stroke, revealed left to right.
              backgroundImage: crossed ? strikeImage(p.red) : 'none',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left center',
              backgroundSize: crossed ? '100% 100%' : '0% 100%',
              px: '3px',
              mx: '-3px',
              WebkitBoxDecorationBreak: 'clone',
              boxDecorationBreak: 'clone',
              transition: motion
                ? `background-size ${STRIKE_MS}ms cubic-bezier(.3,.6,.25,1), color 200ms ease ${STRIKE_MS}ms`
                : 'none',
            }}
          >
            {task.content}
          </Box>
          {kind && <Box component="span" sx={srOnly}>{`, ${kind.toLowerCase()}`}</Box>}
          {task.priority ? <Box component="span" sx={srOnly}>{`, ${PRIORITY[task.priority]}`}</Box> : null}
          {showTags && task.tags?.length > 0 && (
            <Box component="span" sx={{ ml: 2, fontSize: '0.875rem', color: p.muted, whiteSpace: 'normal' }}>
              {task.tags.map((t) => `#${t}`).join(' ')}
            </Box>
          )}
          {task.note && !expanded && (
            <Box component="span" sx={{ display: 'block', fontSize: '0.875rem', color: p.muted, mt: 0.5, overflowWrap: 'anywhere' }}>
              {task.note.split('\n')[0]}
            </Box>
          )}
        </ButtonBase>

        {when.text && (
          <Box
            sx={{
              flexShrink: 0, pt: 3.25, pr: 1, fontSize: '0.875rem', lineHeight: '20px',
              whiteSpace: 'nowrap',
              color: when.late ? p.red : p.grey,
              fontWeight: when.late ? 600 : 400,
            }}
          >
            {when.text}
          </Box>
        )}

        {canHover && (
          <Box
            data-row-actions
            sx={{
              position: 'absolute', right: 4, top: 6, display: 'flex', gap: 0.5,
              backgroundColor: p.fill, borderRadius: '4px', opacity: 0,
              transition: motion ? 'opacity 100ms ease' : 'none',
            }}
          >
            <HoverAction label={done ? 'Not done' : 'Done'} onClick={() => onDone?.(task)}><Check size={18} /></HoverAction>
            {!done && <HoverAction label="Tomorrow" onClick={() => onTomorrow?.(task)}><ArrowRight size={18} /></HoverAction>}
            {!done && <HoverAction label="Pick a date" onClick={() => onPickDate?.(task)}><CalendarDays size={18} /></HoverAction>}
          </Box>
        )}
      </Box>

      {expanded && editor && (
        <Box id={editorId} sx={{ backgroundColor: p.fill, pl: { xs: 4, sm: 16 }, pr: { xs: 4, sm: 6 }, pb: 4 }}>
          {editor}
        </Box>
      )}
    </Box>
  );
}

export default memo(PenRow);
