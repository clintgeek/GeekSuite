/**
 * PenRow — one task, Red Pen style (DOCS/SIMPLE_PLAN.md § "A task row",
 * Identity items 3–6).
 *
 *   [margin]  [□]  words #tag #tag                       9am
 *
 * - The margin carries the proofreader's marks: a red bar for priority (full
 *   height High, half Medium, grey half Low) and, for non-task kinds only, the
 *   signifier glyph in grey. A plain task shows nothing there.
 * - The square is the checkbox. Ticking it fills it red and draws the strike
 *   through the words (see penMarks.js); the words then grey.
 * - Right-hand side: the time, "tomorrow", a weekday — grey — or, when it is
 *   late, red words ("2 days late").
 * - Tapping the words opens the inline editor below the row.
 * - Desktop (a real hover): done / tomorrow / pick-a-date buttons appear on
 *   hover or keyboard focus. Phone: swipe right for done, left for tomorrow,
 *   a long swipe left to pick a date (hooks/useSwipe.js).
 * - PRIVATE tasks (2026-10-01, context/PrivacyContext.jsx). On a desktop the
 *   words, tags and note are NOT RENDERED until revealed: the row shows an
 *   eye-slash and an ink redaction bar, one button whose accessible name is
 *   "Private task, hidden. Activate to show." — nothing to select, copy, read
 *   aloud or catch in a screenshot. Click / Enter / Space reveals that task in
 *   place; the eye-slash before the words then hides it again. An open editor
 *   is revealed while open, and blurred while the window is away. The square,
 *   the priority mark, the kind glyph and the date stay, so the list still
 *   reads. On a phone the words show, with a small eye-slash mark.
 */
import { memo, useEffect, useId, useRef } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Box, ButtonBase, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ArrowRight, CalendarDays, Check, EyeOff, GripVertical } from 'lucide-react';
import { useReducedMotion } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';
import { STRIKE_MS, TICK_PATH, redactionWidth, srOnly, strikeImage } from './penMarks';
import useSwipe from '../../hooks/useSwipe';
import { isDone, whenLabel } from '../../utils/penViews';
import { HIDDEN_LABEL, PRIVATE_LABEL, usePrivacy } from '../../context/PrivacyContext';

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

/** A finger must rest this long on the grip before it drags (a scroll moves sooner). */
export const HOLD_MS = 200;
const HOLD_SLOP = 8;

/**
 * The grip. Mouse: drags at once. Touch / pen: HOLD_MS still first — moving
 * more than HOLD_SLOP before then is a scroll and the grip lets it go. Once
 * armed, the grip's non-passive `touchmove` stops the page scrolling under
 * the drag. ↑ / ↓ (with or without Alt) move the task one place.
 */
function DragHandle({ label, controls, onMove, p }) {
  const ref = useRef(null);
  const hold = useRef(null);

  const clear = () => {
    if (hold.current?.timer) clearTimeout(hold.current.timer);
    hold.current = null;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const block = (e) => { if (hold.current?.armed && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => { el.removeEventListener('touchmove', block); clear(); };
  }, []);

  const onPointerDown = (e) => {
    e.stopPropagation(); // the row's swipe must not start under the grip
    if (e.button > 0) return;
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      controls.start(e);
      return;
    }
    clear();
    const origin = e.nativeEvent;
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      armed: false,
      timer: setTimeout(() => {
        if (!hold.current) return;
        hold.current.armed = true;
        hold.current.timer = null;
        controls.start(origin);
      }, HOLD_MS),
    };
  };

  const onPointerMove = (e) => {
    const h = hold.current;
    if (h && !h.armed && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) clear();
  };

  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation(); // not the page's Alt+arrow as well
    onMove?.(delta);
  };

  return (
    <ButtonBase
      ref={ref}
      aria-label={label}
      data-drag-handle
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      sx={{
        width: 44, height: 44, flexShrink: 0, borderRadius: '4px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: p.box, cursor: 'grab', touchAction: 'pan-y',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        '&:active': { cursor: 'grabbing' },
        '@media (hover: hover)': { '&:hover': { color: p.ink } },
        '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -4, color: p.ink },
      }}
    >
      <GripVertical size={18} strokeWidth={1.75} aria-hidden />
    </ButtonBase>
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
  sortable = false,
  sortMotion = false,
  onMove,
  onDragEnd,
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
  const privacy = usePrivacy();
  const isPrivate = task.private === true;
  const revealed = isPrivate && privacy.isRevealed(id);
  // Hidden: a private task, on a desktop, not revealed, its editor not open.
  const hidden = isPrivate && privacy.hides && !revealed && !expanded;
  const name = hidden ? PRIVATE_LABEL : task.content;
  const wordsButtonSx = {
    flex: 1, minWidth: 0, minHeight: 44, py: 2.5, pl: 1, pr: 2,
    display: 'block', textAlign: 'left', borderRadius: '4px',
    '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -2 },
  };
  const swipe = useSwipe({
    enabled: !canHover && !expanded,
    onDone: () => onDone?.(task),
    onTomorrow: () => onTomorrow?.(task),
    onPick: () => onPickDate?.(task),
  });

  const dragControls = useDragControls();
  const canDrag = sortable && !crossed && !expanded && !isDone(task);
  // A Reorder.Item only inside Today's Reorder.Group; an ordinary <li> everywhere else.
  const sortProps = sortable ? {
    value: id,
    dragListener: false,
    dragControls,
    layout: 'position',
    transition: { duration: sortMotion && motion ? 0.15 : 0 },
    // Lifted while held: a hairline shadow, no scale — the strike stays the
    // app's one flourish.
    whileDrag: { boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
    onDragEnd: () => onDragEnd?.(task),
  } : {};

  const pending = swipe.pending;
  const reveal = swipe.dx > 0 ? 'left' : swipe.dx < 0 ? 'right' : null;
  const revealLabel = swipe.dx > 0
    ? (isDone(task) ? 'Not done' : 'Done')
    : pending === 'pick' ? 'Pick a date' : 'Tomorrow';

  const rowSx = { listStyle: 'none', position: 'relative', borderBottom: `1px solid ${p.rule}` };
  const body = (
    <>
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
          pr: sortable ? 0 : 1,
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
          label={`${done ? 'Not done' : 'Done'}: ${name}`}
          onClick={() => onDone?.(task)}
        />

        {hidden && (
          // The words are not in the DOM: only the mark and a bar.
          <ButtonBase
            onClick={() => privacy.reveal(id)}
            aria-label={HIDDEN_LABEL}
            data-private-hidden
            sx={{ ...wordsButtonSx, userSelect: 'none' }}
          >
            <Box component="span" aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
              <EyeOff size={16} strokeWidth={1.75} color={p.grey} style={{ flexShrink: 0 }} />
              <Box
                component="span"
                data-redaction
                sx={{
                  display: 'block', width: redactionWidth(task.content), maxWidth: 'calc(100% - 24px)', height: 12,
                  borderRadius: '2px', backgroundColor: done ? p.muted : p.ink, opacity: done ? 0.5 : 0.85,
                }}
              />
            </Box>
          </ButtonBase>
        )}

        {isPrivate && privacy.hides && !hidden && !expanded && (
          <Tooltip title="Hide" enterDelay={400}>
            <IconButton
              aria-label="Hide private task"
              onClick={() => privacy.hide(id)}
              data-private-hide
              sx={{ width: 40, height: 40, mt: 0.75, mr: -1, flexShrink: 0, color: p.grey, '&:hover': { color: p.ink } }}
            >
              <EyeOff size={16} strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        )}

        {!hidden && (
        <ButtonBase
          onClick={() => onToggleExpand?.(task)}
          aria-expanded={expanded}
          aria-controls={expanded ? editorId : undefined}
          sx={wordsButtonSx}
        >
          {isPrivate && !privacy.hides && (
            // Phone: the words show; the mark says they are private.
            <Box component="span" aria-hidden data-private-mark sx={{ display: 'inline-flex', verticalAlign: '-2px', mr: 1.5, color: p.grey }}>
              <EyeOff size={15} strokeWidth={1.75} />
            </Box>
          )}
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
          {isPrivate && <Box component="span" sx={srOnly}>, private</Box>}
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
        )}

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

        {sortable && (canDrag ? (
          <DragHandle
            label={`Move ${name}`}
            controls={dragControls}
            onMove={(delta) => onMove?.(task, delta)}
            p={p}
          />
        ) : (
          // Settling or open: the grip's room stays, so nothing shifts.
          <Box aria-hidden sx={{ width: 44, height: 44, flexShrink: 0 }} />
        ))}

        {canHover && (
          <Box
            data-row-actions
            sx={{
              position: 'absolute', right: sortable ? 48 : 4, top: 6, display: 'flex', gap: 0.5,
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
        <Box
          id={editorId}
          data-private-away={isPrivate && privacy.away ? 'true' : undefined}
          sx={{
            backgroundColor: p.fill, pl: { xs: 4, sm: 16 }, pr: { xs: 4, sm: 6 }, pb: 4,
            // A private task's open editor, while the window is away (a screen
            // share starting): blurred, not closed — the edit is kept.
            filter: isPrivate && privacy.away ? 'blur(10px)' : 'none',
          }}
        >
          {editor}
        </Box>
      )}
    </>
  );

  if (sortable) {
    // Reorder.Item is the <li> itself (inside Today's Reorder.Group, a <ul>);
    // the Pen styling sits on a Box just inside it.
    return (
      <Reorder.Item
        as="li"
        {...sortProps}
        data-row-id={id}
        data-crossed={crossed ? 'true' : undefined}
        style={{ listStyle: 'none', position: 'relative' }}
      >
        <Box sx={{ ...rowSx, listStyle: undefined }}>{body}</Box>
      </Reorder.Item>
    );
  }

  return (
    <Box component="li" data-row-id={id} data-crossed={crossed ? 'true' : undefined} sx={rowSx}>
      {body}
    </Box>
  );
}

export default memo(PenRow);
