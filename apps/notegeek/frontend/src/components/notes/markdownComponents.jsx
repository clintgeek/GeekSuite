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
// Deep imports (see RichTextEditor.jsx for why).
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';

// eslint-disable-next-line no-unused-vars -- `node` is react-markdown's AST node; keep it off the DOM
function ScrollingTable({ node, ...props }) {
    return (
        <div className="md-table-scroll" role="region" aria-label="Table" tabIndex={0}>
            <table {...props} />
        </div>
    );
}

/**
 * A GFM task box (`- [ ]` / `- [x]`). remark-gfm renders a disabled
 * `<input type="checkbox">` with no label: axe fails it (`label`, critical)
 * and on a phone it is a 13px "control" that does nothing when tapped. Found
 * by the handwriting harness scene (2026-09-27), because Compose's own prompt
 * ends documents with `- [ ]` next steps. Rendered markdown is read-only, so
 * the box is shown as what it is — a named picture of a state — not a form
 * control.
 */
// `node` is react-markdown's AST node (kept off the DOM). This file is the
// shared overrides table, so it exports data beside components by design.
// eslint-disable-next-line no-unused-vars, react-refresh/only-export-components
function TaskBox({ node, type, checked, disabled, ...props }) {
    if (type !== 'checkbox') return <input type={type} disabled={disabled} {...props} />;
    const Icon = checked ? CheckBoxOutlined : CheckBoxOutlineBlank;
    return (
        <Icon
            titleAccess={checked ? 'Done' : 'Not done'}
            sx={{ fontSize: '1.15em', verticalAlign: '-0.2em', mr: 1, color: 'text.secondary' }}
        />
    );
}

export const MARKDOWN_COMPONENTS = { table: ScrollingTable, input: TaskBox };

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
