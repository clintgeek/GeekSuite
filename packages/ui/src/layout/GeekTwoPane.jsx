/**
 * GeekTwoPane — list | detail (plan 2.6, P2a, P2b).
 *
 * From 1024 px wide (`useFormFactor().twoPane`: tablet landscape, desktop)
 * the list and the detail sit side by side; below that ONE pane shows at a
 * time, chosen by whether there is a detail — which is exactly what the
 * app's existing routes already do. Portrait tablet (800 px, Chef's grip) is
 * therefore rail + one pane.
 *
 * Route it with an outlet, so the same routes work at every width:
 *
 *   <Route path="/notes" element={<NotesLayout />}>
 *     <Route index element={null} />
 *     <Route path=":id" element={<NoteDetail />} />
 *   </Route>
 *
 *   function NotesLayout() {
 *     const detail = useOutlet();            // null on /notes
 *     return (
 *       <GeekTwoPane
 *         list={<NoteList />}
 *         detail={detail}
 *         placeholder={<GeekEmptyState title="Pick a note" />}
 *       />
 *     );
 *   }
 *
 *   - two panes: the list keeps its place and scroll while the detail
 *     changes; no detail → `placeholder` (nothing if omitted);
 *   - one pane: `/notes` shows the list, `/notes/42` the detail — the
 *     detail's own Back goes to the list, as today.
 *
 * Each pane scrolls on its own (`overflowY: auto`, `minHeight: 0`), so the
 * component must be given a height — the shell's content column or a flex
 * parent. The list pane is `listWidth` wide (default clamps 320–400 px
 * across the window); the detail takes the rest. Both are labelled regions
 * (`listLabel`, `detailLabel`). Structure only: the divider is
 * `palette.divider`, the grounds are the app's (`sx`, `listSx`, `detailSx`).
 *
 * `twoPane` forces a layout (tests, an app with its own rule); `showDetail`
 * overrides "is there a detail" (default: `detail` is not null/false).
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import { useFormFactor } from '../hooks/useFormFactor.js';

export const GEEK_TWO_PANE_LIST_WIDTH = 'clamp(320px, 32vw, 400px)';

const paneScroll = {
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
};

export const GeekTwoPane = forwardRef(function GeekTwoPane(
  {
    list,
    detail,
    placeholder = null,
    showDetail,
    twoPane: twoPaneProp,
    listWidth = GEEK_TWO_PANE_LIST_WIDTH,
    listLabel = 'List',
    detailLabel = 'Detail',
    sx,
    listSx,
    detailSx,
    ...props
  },
  ref
) {
  const formFactor = useFormFactor();
  const twoPane = twoPaneProp ?? formFactor.twoPane;
  const hasDetail = showDetail ?? (detail != null && detail !== false);

  if (!twoPane) {
    const showing = hasDetail ? 'detail' : 'list';
    return (
      <Box
        ref={ref}
        data-geek-two-pane="single"
        data-geek-two-pane-showing={showing}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...sx }}
        {...props}
      >
        <Box
          component="section"
          aria-label={hasDetail ? detailLabel : listLabel}
          data-geek-pane={showing}
          sx={{ ...paneScroll, flex: 1, ...(hasDetail ? detailSx : listSx) }}
        >
          {hasDetail ? detail : list}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={ref}
      data-geek-two-pane="split"
      sx={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0, ...sx }}
      {...props}
    >
      <Box
        component="section"
        aria-label={listLabel}
        data-geek-pane="list"
        sx={{
          ...paneScroll,
          flex: `0 0 ${listWidth}`,
          width: listWidth,
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          ...listSx,
        }}
      >
        {list}
      </Box>
      <Box
        component="section"
        aria-label={detailLabel}
        data-geek-pane={hasDetail ? 'detail' : 'placeholder'}
        sx={{ ...paneScroll, flex: 1, ...detailSx }}
      >
        {hasDetail ? detail : placeholder}
      </Box>
    </Box>
  );
});
