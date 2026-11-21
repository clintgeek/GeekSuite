/**
 * usePenRows — what every list view shares: rows that open their editor in
 * place (a bottom sheet on a phone), one pick-a-date sheet, and the desktop
 * keys with focus following the task id (hooks/useRowKeys.js).
 *
 * @param {object[]} order  the rows in on-screen order (keyboard j/k order)
 * @param {object} [sorting]  Today's manual order: `onMove(task, ±1)` (Alt+↑/↓
 *   and the grip's arrows) and `onDragEnd(task)`; rows rendered with
 *   `{ sortable: true }` get the grip.
 *
 * ## Re-renders (plan 5.12)
 * `usePen()` returns a new object on every change (a tick, a toast, a fetch),
 * and the handlers used to be built from it, so every row re-rendered and
 * `memo(PenRow)` did nothing. The handlers now read the latest `pen` and the
 * latest sorting handlers through refs and are created once: a row re-renders
 * only when its own props change.
 *
 * ## Two panes (tablet wave 3)
 * With `{ pane: true }` (Today from 1024 px, `GeekTwoPane`) the open task's
 * editor is not drawn under its row or in a sheet: it comes back as `detail`
 * for the page to put in the right-hand pane. The row stays highlighted and
 * every rule below (save on leave, Escape discards) is the same.
 *
 * ## Leaving an open editor (plan 1.13)
 * Opening another row, tapping this one again, ticking it, or dismissing the
 * sheet SAVES what changed (InlineEditor.requestSave). Escape and Cancel
 * inside the editor are the explicit discard.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekSheet } from '@geeksuite/ui';
import PenRow from './PenRow';
import InlineEditor from './InlineEditor';
import DatePickSheet from './DatePickSheet';
import useRowKeys from '../../hooks/useRowKeys';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import useTodoLayout from '../../hooks/useTodoLayout';
import { usePen } from '../../context/PenContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { isDone, taskId } from '../../utils/penViews';
import { isCheckable } from './penKinds';

export default function usePenRows(order, { onMove, onDragEnd, pane = false } = {}) {
  const pen = usePen();
  const theme = useTheme();
  const privacy = usePrivacy();
  const { inlineWhen } = useTodoLayout();
  const paneId = useId();
  // Phone and narrow tablet: the editor is a bottom sheet. Two panes: the right pane.
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const asSheet = narrow && !pane;
  const keyboard = useKeyboardInset();

  const penRef = useRef(pen);
  penRef.current = pen;
  const sortingRef = useRef({ onMove, onDragEnd });
  sortingRef.current = { onMove, onDragEnd };

  const [expandedId, setExpandedIdState] = useState(null);
  const expandedRef = useRef(null);
  const setExpandedId = useCallback((id) => {
    expandedRef.current = id;
    setExpandedIdState(id);
  }, []);
  const [picking, setPicking] = useState(null);
  const editorApi = useRef(null);

  /**
   * Close the open editor, saving what changed. False when it has to stay open
   * (a repeating task with changes is asking "this one or every one?" above
   * its two Save buttons, or its words were emptied).
   */
  const collapse = useCallback(() => {
    const api = editorApi.current;
    if (api?.hasChanges()) {
      const result = api.requestSave();
      if (result === 'blocked' || result === 'asked') return false;
    }
    setExpandedId(null);
    return true;
  }, [setExpandedId]);

  // A row that left the list (ticked off, moved away) takes its editor with it.
  useEffect(() => {
    if (expandedId !== null && !order.some((t) => taskId(t) === expandedId)) setExpandedId(null);
  }, [order, expandedId, setExpandedId]);

  const onDone = useCallback((task) => {
    if (!isCheckable(task)) return; // a note or an event is written down, not ticked
    if (expandedRef.current === taskId(task) && !collapse()) return;
    penRef.current.toggleDone(task);
  }, [collapse]);
  const onTomorrow = useCallback((task) => { if (!isDone(task)) penRef.current.moveToTomorrow(task); }, []);
  const onPickDate = useCallback((task) => { if (!isDone(task)) setPicking(task); }, []);
  const onToggleExpand = useCallback((task) => {
    const id = taskId(task);
    if (expandedRef.current === id) { collapse(); return; }
    if (expandedRef.current !== null && !collapse()) return;
    setExpandedId(id);
  }, [collapse, setExpandedId]);
  const onRowMove = useCallback((task, delta) => sortingRef.current.onMove?.(task, delta), []);
  const onRowDragEnd = useCallback((task) => sortingRef.current.onDragEnd?.(task), []);

  const keys = useRowKeys({
    tasks: order,
    enabled: !picking,
    onDone,
    onTomorrow,
    onPickDate,
    onEdit: onToggleExpand,
    onMove: onRowMove,
  });

  const openEditor = useCallback((task, layout) => (
    <InlineEditor
      task={task}
      layout={layout}
      apiRef={editorApi}
      onCancel={() => setExpandedId(expandedRef.current === taskId(task) ? null : expandedRef.current)}
      onSave={async (fields, scope) => Boolean(await penRef.current.save(task, fields, scope))}
      onDelete={(t) => { setExpandedId(null); penRef.current.remove(t); }}
    />
  ), [setExpandedId]);

  const renderRow = (task, { context = 'list', crossed = false, sortable = false, sortMotion = false } = {}) => {
    const id = taskId(task);
    const expanded = expandedId === id;
    return (
      <PenRow
        key={id}
        task={task}
        now={pen.now}
        context={context}
        crossed={crossed}
        focused={keys.focusedTaskId === id}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        onDone={onDone}
        onTomorrow={onTomorrow}
        onPickDate={onPickDate}
        sortable={sortable}
        sortMotion={sortMotion}
        onMove={sortable ? onRowMove : undefined}
        onDragEnd={sortable ? onRowDragEnd : undefined}
        inlineWhen={inlineWhen}
        controlsId={pane && expanded ? paneId : undefined}
        editor={expanded && !asSheet && !pane ? openEditor(task, 'inline') : null}
      />
    );
  };

  const editing = expandedId !== null ? order.find((t) => taskId(t) === expandedId) : null;
  const private_ = editing?.private === true;
  const sheet = (
    <>
      <DatePickSheet
        task={picking}
        now={pen.now}
        onClose={() => setPicking(null)}
        onPick={(task, key, label) => penRef.current.moveTo(task, key, { label })}
      />
      {asSheet && (
        <GeekSheet
          open={Boolean(editing)}
          onClose={collapse}
          title="Edit task"
          sx={keyboard ? {
            // Above the keyboard, not under it (the layout viewport does not
            // shrink for it in Chrome on Android).
            mb: `${keyboard}px`,
            maxHeight: `calc(92vh - ${keyboard}px)`,
            '@supports (max-height: 92dvh)': { maxHeight: `calc(92dvh - ${keyboard}px)` },
          } : undefined}
        >
          {editing && (
            <Box
              data-private-away={private_ && privacy.away ? 'true' : undefined}
              sx={{ pb: 2, filter: private_ && privacy.away ? 'blur(10px)' : 'none' }}
            >
              {openEditor(editing, 'sheet')}
            </Box>
          )}
        </GeekSheet>
      )}
    </>
  );

  const detail = pane && editing ? (
    <Box
      key={expandedId}
      id={paneId}
      data-task-detail
      data-private-away={private_ && privacy.away ? 'true' : undefined}
      sx={{ filter: private_ && privacy.away ? 'blur(10px)' : 'none' }}
    >
      {openEditor(editing, 'pane')}
    </Box>
  ) : null;

  return { renderRow, sheet, detail, focusedTaskId: keys.focusedTaskId, expandedId, collapse };
}
