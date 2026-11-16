/**
 * GeekContentColumn — caps and centres a page's reading column on anything
 * wider than a phone (tablet baseline "Fix first" 2).
 *
 * NoteGeek's list, TodoGeek's Today and BookGeek's list view run their rows
 * 700–780 px wide at 800 px, with the title at the left edge and its
 * metadata at the right. Wrapping the page in this column keeps the row a
 * readable width:
 *
 *   <GeekContentColumn>
 *     <TaskList />
 *   </GeekContentColumn>
 *
 *   <GeekContentColumn maxWidth={600} sx={{ px: 2 }}>…</GeekContentColumn>
 *
 *   - phone (`geekMedia.tabletUp` does not match, which includes a phone
 *     held sideways): full width, exactly as without it;
 *   - wider: at most `maxWidth` px (default 680), centred with auto margins.
 *
 * The rail: the column centres in its PARENT, never on the viewport — no
 * `vw`, no `left` offsets. Inside `GeekShell` its parent is the content
 * column, which already starts after a `GeekNavRail` (or a sidebar), so at
 * 800 px with the 72 px rail it centres in the remaining 728 px. A page that
 * pins something with `position: fixed` is outside this rule and must clear
 * the rail itself (`useGeekShell().leftInset`).
 *
 * Structure only: no padding, colour or background — gutters are the page's
 * (`sx`). `maxWidth={false}` turns the cap off. `component` sets the element
 * (default `div`; `main`, `section`, `ul`…).
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import { geekMedia } from '../hooks/useFormFactor.js';

export const GEEK_CONTENT_COLUMN_MAX_WIDTH = 680;

export const GeekContentColumn = forwardRef(function GeekContentColumn(
  { maxWidth = GEEK_CONTENT_COLUMN_MAX_WIDTH, component = 'div', children, sx, ...props },
  ref
) {
  return (
    <Box
      ref={ref}
      component={component}
      data-geek-content-column=""
      sx={{
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        ...(maxWidth ? { [geekMedia.tabletUp]: { maxWidth, mx: 'auto' } } : null),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
});
