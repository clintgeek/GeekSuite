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
 */
import { useMemo, useState } from 'react';
import { Box, ButtonBase, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ChevronRight } from 'lucide-react';
import { useGeekShell } from '@geeksuite/ui';
import { usePen } from '../context/PenContext';
import { penOf } from '../theme/pen';
import AddBox from '../components/pen/AddBox';
import TagChips from '../components/pen/TagChips';
import PenPage, { PenLoading } from '../components/pen/PenPage';
import usePenRows from '../components/pen/usePenRows';
import { DeskDate, EmptyLine, SectionCaption } from '../components/pen/PenHeadings';
import useKeyboardInset from '../hooks/useKeyboardInset';
import { todaySections, withSettling } from '../utils/penViews';

function OverdueLine({ count, open, onToggle, onMoveAll, p }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${p.rule}`, minHeight: 52, pl: 1 }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="overdue-list"
        sx={{ minHeight: 44, px: 2, gap: 2, borderRadius: '4px', fontSize: '1rem', fontWeight: 600, color: p.ink }}
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
  return (
    <Box
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

const TodayPage = () => {
  const pen = usePen();
  const theme = useTheme();
  const p = penOf(theme);
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const [overdueOpen, setOverdueOpen] = useState(false);

  const counts = useMemo(() => todaySections(pen.visible, pen.now).counts, [pen.visible, pen.now]);
  const sections = useMemo(
    () => todaySections(withSettling(pen.visible, pen.settling), pen.now),
    [pen.visible, pen.settling, pen.now],
  );
  const order = useMemo(
    () => [...(overdueOpen ? sections.overdue : []), ...sections.today, ...sections.anytime].map(real),
    [sections, overdueOpen],
  );
  const { renderRow, sheet, expandedId } = usePenRows(order);
  const row = (t) => renderRow(real(t), { crossed: Boolean(t.__real) });

  // On desktop the box takes focus only when there is nothing to do: with a
  // list on screen, the keys (j k x t d e) are the faster way in; `/` or
  // Ctrl+N reach the box from anywhere.
  const addBox = (
    <AddBox
      onAdd={pen.add}
      onHelp={() => pen.setHelpOpen(true)}
      now={pen.now}
      autoFocus={!isPhone && pen.loaded && counts.toDo === 0}
    />
  );

  return (
    <PenPage dock={isPhone}>
      <DeskDate date={pen.now} toDo={counts.toDo} done={counts.done} />
      <Box sx={{ pb: 4 }}><TagChips /></Box>

      {!isPhone && <Box sx={{ pb: 5 }}>{addBox}</Box>}

      {!pen.loaded ? <PenLoading /> : (
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
            {sections.today.length > 0 ? (
              <Box component="ul" sx={{ m: 0, p: 0 }}>{sections.today.map(row)}</Box>
            ) : (
              <EmptyLine>{pen.tagFilter ? `Nothing tagged #${pen.tagFilter} today.` : 'Nothing due today.'}</EmptyLine>
            )}
          </Box>

          {sections.anytime.length > 0 && (
            <Box component="section" aria-labelledby="anytime-caption">
              <SectionCaption id="anytime-caption" aside={`${sections.anytime.length}`}>Anytime</SectionCaption>
              <Box component="ul" sx={{ m: 0, p: 0 }}>{sections.anytime.map(row)}</Box>
            </Box>
          )}
        </>
      )}

      {/* The editor needs the room; the add box comes back when it closes. */}
      {isPhone && !expandedId && <Dock>{addBox}</Dock>}
      {sheet}
    </PenPage>
  );
};

export default TodayPage;
