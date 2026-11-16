import React, { forwardRef } from 'react';
import { GeekContentColumn } from '@geeksuite/ui';
import { layout } from '../../theme/tokens';
import { useNoteFormFactor } from '../../hooks/useNoteFormFactor';

/**
 * The reading column every list page sits in (notes, a tag, search, home,
 * archived, recently deleted) — `GeekContentColumn` with NoteGeek's widths:
 *
 *   phone   — full width, as before (the column does nothing under 600 px);
 *   tablet  — `layout.tabletContentWidth` (600), centred: at 800 px a row
 *             ran ~700 px with "2h ago" at the far edge (tablet baseline);
 *   desktop — `layout.contentWidth` (720), as before.
 *
 * Gutters stay the page's (`sx`).
 */
const ListColumn = forwardRef(function ListColumn({ children, sx, ...props }, ref) {
  const { kind } = useNoteFormFactor();
  const maxWidth = kind === 'tablet' ? layout.tabletContentWidth : layout.contentWidth;
  return (
    <GeekContentColumn ref={ref} maxWidth={maxWidth} data-list-column={kind} sx={sx} {...props}>
      {children}
    </GeekContentColumn>
  );
});

export function useListWidth() {
  const { kind } = useNoteFormFactor();
  return kind === 'tablet' ? layout.tabletContentWidth : layout.contentWidth;
}

export default ListColumn;
