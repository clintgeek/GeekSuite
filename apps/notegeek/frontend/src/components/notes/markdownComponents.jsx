/**
 * markdownComponents — shared react-markdown overrides for every place
 * NoteGeek renders markdown (editor preview, note viewer, Compose).
 *
 * A GFM table can't shrink below its content, so a wide one ran out past the
 * note's ~70ch column (Chef, 2026-09-27; harness scenes 11 and 11b). Each
 * table now sits in its own horizontal scroller, so the page stays put and
 * only the table scrolls. The scroller is focusable and named: axe requires a
 * scrollable region to be reachable by keyboard.
 */
import React from 'react';

// eslint-disable-next-line no-unused-vars -- `node` is react-markdown's AST node; keep it off the DOM
function ScrollingTable({ node, ...props }) {
    return (
        <div className="md-table-scroll" role="region" aria-label="Table" tabIndex={0}>
            <table {...props} />
        </div>
    );
}

export const MARKDOWN_COMPONENTS = { table: ScrollingTable };

/**
 * The sx both renderers spread in. Wide tables scroll inside their own box
 * instead of pushing the column, and long unbroken words (URLs) wrap.
 */
export const markdownOverflowSx = {
    minWidth: 0,
    overflowWrap: 'anywhere',
    '& .md-table-scroll': {
        maxWidth: '100%',
        overflowX: 'auto',
        mb: 4,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
    },
    // A narrow table still fills the column; a wide one takes the width it
    // needs and scrolls. Cells don't break words mid-way.
    '& .md-table-scroll > table': {
        width: 'max-content',
        minWidth: '100%',
        mb: 0,
        overflowWrap: 'normal',
    },
};
