/**
 * Today — the page TodoGeek opens on (DOCS/SIMPLE_PLAN.md § "Three views").
 *
 *   desk-calendar date · "4 to do · 2 done"
 *   pinned tag chips
 *   the add box (in the page on desktop; docked above the nav on a phone)
 *   "3 carried over" — one line, a count and "Move all to today"; tap to open
 *   today's tasks, priority then time
 *   Anytime (no date)
 *
 * A task ticked here is drawn crossed off in place for a moment, then leaves
 * for Done (PenContext SETTLE_MS; at once under reduced motion).
 *
 * Today and Anytime can be put in your own order (2026-10-29,
 * DOCS/SORTING_RULES.md § "Manual order (Today)"): each row has a grip at its
 * end (framer-motion `Reorder`, only the grip starts a drag); on a desktop
 * Alt+↑ / Alt+↓ move the selected task. Within a section, never across. The
 * order is saved for TODAY's local date (`useDailyOrder`), so tomorrow starts
 * from the normal rule; how it is applied is `utils/manualOrder.js`. A move
 * is said out loud in a polite live region. Carried over is not sortable.
 *
 * On a phone the grips are not on every row (a permanent 44px grip left 140px
 * for the words, 3.16): "Reorder" in the header turns them on, "Done" turns
 * them off. Notes and events are not to-dos (D4): no count, no carry-over.
 * The add box is docked on a phone and sticky on a desktop; it takes focus by
 * itself ONCE, on a desktop, when the page opens with nothing to do — never
 * again when you tick the last task (that popped the keyboard on a tablet).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { Box, Button, ButtonBase, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ChevronRight } from 'lucide-react';
import { useGeekShell, useGeekToastClearance } from '@geeksuite/ui';
import { usePen } from '../context/PenContext';
import { penOf } from '../theme/pen';
import AddBox from '../components/pen/AddBox';
import TagChips from '../components/pen/TagChips';
import PenPage, { PenLoadError, PenLoading } from '../components/pen/PenPage';
import usePenRows from '../components/pen/usePenRows';
import { DeskDate, EmptyLine, SectionCaption } from '../components/pen/PenHeadings';
import { srOnly } from '../components/pen/penMarks';
import useKeyboardInset from '../hooks/useKeyboardInset';
import useDailyOrder from '../hooks/useDailyOrder';
import { PRIVATE_LABEL } from '../context/PrivacyContext';
import { dayKey, taskId, todaySections, withSettling } from '../utils/penViews';
import { applyKinds } from '../components/pen/penKinds';
import { manualSections, moveIdBy, reorderSubset } from '../utils/manualOrder';

function OverdueLine({ count, open, onToggle, onMoveAll, p }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${p.rule}`, minHeight: 52, pl: 1 }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="overdue-list"
        sx={{
          minHeight: 44, px: 2, gap: 2, borderRadius: '4px', fontSize: '1rem', fontWeight: 600, color: p.ink,
          // The focus highlight stays inside the button (an outer ring was clipped on the open header).
          '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -2 },
        }}
      >
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', transition: 'none', transform: open ? 'rotate(90deg)' : 'none' }}>
          <ChevronRight size={18} />
        </Box>
        <span>
          <Box component="span" sx={{ color: p.red }}>{count}</Box> carried over
        </span>
      </ButtonBase>
      <Box sx={{ flex: 1 }} />
      <ButtonBase
        onClick={onMoveAll}
        sx={{ minHeight: 44, px: 2, borderRadius: '4px', fontSize: '0.9375rem', fontWeight: 600, color: p.ink, textDecoration: 'underline', textUnderlineOffset: '3px' }}
      >
        Move all to today
      </ButtonBase>
    </Box>
  );
}

function Dock({ children }) {
  const { bottomInset } = useGeekShell();
  const keyboard = useKeyboardInset();
  const theme = useTheme();
  const p = penOf(theme);
  const ref = useRef(null);
  // Toasts ("Done. Undo", "Added for tomorrow.") rise above the box instead of
  // sitting on it, and above the keyboard with it (3.13).
  useGeekToastClearance(ref, true);
  return (
    <Box
      ref={ref}
      data-add-dock
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: keyboard ? `${keyboard}px` : `calc(${bottomInset}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: (t) => t.zIndex.appBar - 1,
        px: 4,
        py: 2,
        backgroundColor: p.paper,
        borderTop: `1px solid ${p.rule}`,
      }}
    >
      {children}
    </Box>
  );
}

const real = (t) => t.__real || t;
const SORTABLE = ['today', 'anytime'];
// A move is said with the task's words — never a private task's.
const spoken = (task) => (task?.private === true ? PRIVATE_LABEL : task?.content || 'Task');

/** `list` in the order of `ids` (a drag in progress); any task the drag does not know goes last. */
function inDraftOrder(list, ids) {
  const byId = new Map(list.map((t) => [taskId(t), t]));
  const out = ids.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(ids);
  return [...out, ...list.filter((t) => !seen.has(taskId(t)))];
}

const TodayPage = () => {
  const pen = usePen();
  const theme = useTheme();
  const p = penOf(theme);
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [reorder, setReorder] = useState(false);
  const canHover = useMediaQuery('(any-hover: hover) and (any-pointer: fine)');
  const daily = useDailyOrder(dayKey(pen.now));
  // A drag in progress: { section, ids } — the order Reorder reports as the row moves.
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const [said, setSaid] = useState('');

  const counts = useMemo(() => applyKinds(todaySections(pen.visible, pen.now)).counts, [pen.visible, pen.now]);
  const auto = useMemo(
    () => applyKinds(todaySections(withSettling(pen.visible, pen.settling), pen.now)),
    [pen.visible, pen.settling, pen.now],
  );
  const manual = useMemo(() => manualSections(auto, daily.ids), [auto, daily.ids]);
  const sections = useMemo(() => ({
    overdue: auto.overdue,
    today: draft?.section === 'today' ? inDraftOrder(manual.today, draft.ids) : manual.today,
    anytime: draft?.section === 'anytime' ? inDraftOrder(manual.anytime, draft.ids) : manual.anytime,
  }), [auto, manual, draft]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  /**
   * Save `visibleIds` as the new order of `section`. With a pinned tag on,
   * the page shows part of each section: the new order fills only those
   * tasks' slots in the whole section, and the other section is saved as it
   * stands, so nothing hidden moves.
   */
  const commit = useCallback((section, visibleIds) => {
    const whole = manualSections(
      todaySections(withSettling(pen.corpus || pen.visible, pen.settling), pen.now),
      daily.ids,
    );
    const ids = { today: whole.today.map(taskId), anytime: whole.anytime.map(taskId) };
    ids[section] = reorderSubset(ids[section], visibleIds);
    daily.save([...ids.today, ...ids.anytime]);
  }, [pen.corpus, pen.visible, pen.settling, pen.now, daily]);

  const announce = useCallback((task, ids) => {
    const at = ids.indexOf(taskId(task));
    if (at >= 0) setSaid(`Moved ‘${spoken(task)}’ to position ${at + 1} of ${ids.length}.`);
  }, []);

  const sectionOf = (id) => SORTABLE.find((name) => sectionsRef.current[name].some((t) => taskId(t) === id));

  const onMove = useCallback((task, delta) => {
    const id = taskId(task);
    if (pen.settling?.has(id)) return; // crossed off and leaving: not movable
    const section = sectionOf(id);
    if (!section) return; // carried over
    const ids = sectionsRef.current[section].map(taskId);
    const next = moveIdBy(ids, id, delta);
    if (next === ids) return;
    commit(section, next);
    announce(task, next);
  }, [pen.settling, commit, announce]);

  const onReorder = (section) => (ids) => {
    draftRef.current = { section, ids };
    setDraft(draftRef.current);
  };

  const onDragEnd = useCallback((task) => {
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!d) return;
    const before = manual[d.section].map(taskId);
    if (before.length === d.ids.length && before.every((id, i) => id === d.ids[i])) return;
    commit(d.section, d.ids);
    announce(task, d.ids);
  }, [manual, commit, announce]);

  const order = useMemo(
    () => [...(overdueOpen ? sections.overdue : []), ...sections.today, ...sections.anytime].map(real),
    [sections, overdueOpen],
  );
  const { renderRow, sheet } = usePenRows(order, { onMove, onDragEnd });
  const row = (t) => renderRow(real(t), { crossed: Boolean(t.__real) });
  // Grips: always on a desktop; on a phone only in Reorder mode.
  const gripsOn = !isPhone || reorder;
  const sortableRow = (t) => renderRow(real(t), { crossed: Boolean(t.__real), sortable: gripsOn, sortMotion: Boolean(draft) });
  const sortableList = (section) => (
    <Reorder.Group
      as="ul"
      axis="y"
      values={sections[section].map(taskId)}
      onReorder={onReorder(section)}
      style={{ margin: 0, padding: 0, listStyle: 'none' }}
    >
      {sections[section].map(sortableRow)}
    </Reorder.Group>
  );

  // On desktop the box takes focus when the page opens with nothing to do:
  // with a list on screen, the keys (j k x t d e) are the faster way in; `/`
  // or Ctrl+N reach the box from anywhere. Decided ONCE, on the first loaded
  // render: ticking the last task must not pull focus (and the keyboard) in.
  const focusOnOpen = useRef(null);
  if (focusOnOpen.current === null && pen.loaded) {
    focusOnOpen.current = !isPhone && canHover && counts.toDo === 0;
  }
  const addBox = (
    <AddBox
      onAdd={pen.add}
      onHelp={() => pen.setHelpOpen(true)}
      now={pen.now}
      autoFocus={focusOnOpen.current === true}
      pendingTag={pen.pendingTag}
      onDismissTag={pen.dismissPendingTag}
    />
  );
  const sortableCount = sections.today.length + sections.anytime.length;

  return (
    <PenPage dock={isPhone}>
      <DeskDate date={pen.now} toDo={counts.toDo} done={counts.done} loading={!pen.loaded || Boolean(pen.loadError && !pen.corpus?.length)} />
      <Box sx={{ pb: isPhone && sortableCount > 1 ? 0 : 4 }}><TagChips /></Box>
      {isPhone && sortableCount > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pb: 1 }}>
          <Button
            onClick={() => setReorder((r) => !r)}
            aria-pressed={reorder}
            data-reorder-toggle
            sx={{ minHeight: 44, px: 2, color: p.ink, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            {reorder ? 'Done reordering' : 'Reorder'}
          </Button>
        </Box>
      )}

      {/* Sticky on a desktop: the list scrolls under it, the box stays. */}
      {!isPhone && (
        <Box data-add-sticky sx={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: p.paper, pb: 5, pt: 1, mt: -1 }}>
          {addBox}
        </Box>
      )}

      {pen.loadError && !(pen.corpus?.length) ? <PenLoadError onRetry={pen.refresh} /> : !pen.loaded ? <PenLoading /> : (
        <>
          {sections.overdue.length > 0 && (
            <Box component="section" aria-label="Carried over">
              <OverdueLine
                count={sections.overdue.length}
                open={overdueOpen}
                onToggle={() => setOverdueOpen((o) => !o)}
                onMoveAll={() => pen.moveAllToToday(sections.overdue.map(real))}
                p={p}
              />
              {overdueOpen && (
                <Box component="ul" id="overdue-list" sx={{ m: 0, p: 0 }}>
                  {sections.overdue.map(row)}
                </Box>
              )}
            </Box>
          )}

          <Box component="section" aria-label="Today">
            {sections.today.length > 0 ? sortableList('today') : (
              <EmptyLine>{pen.tagFilter ? `Nothing tagged #${pen.tagFilter} today.` : 'Nothing due today.'}</EmptyLine>
            )}
          </Box>

          {sections.anytime.length > 0 && (
            <Box component="section" aria-labelledby="anytime-caption">
              <SectionCaption id="anytime-caption" aside={`${sections.anytime.length}`}>Anytime</SectionCaption>
              {sortableList('anytime')}
            </Box>
          )}
        </>
      )}

      <Box role="status" aria-live="polite" data-order-said sx={srOnly}>{said}</Box>

      {/* Always there on a phone: the editor is a sheet over it, so it no longer
          vanishes with the editor (or when the open task is ticked, 3.19). */}
      {isPhone && <Dock>{addBox}</Dock>}
      {sheet}
    </PenPage>
  );
};

export default TodayPage;
