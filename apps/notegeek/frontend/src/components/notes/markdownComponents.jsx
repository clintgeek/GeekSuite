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
import { Link as RouterLink, useInRouterContext } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import remarkInlineTags from '../../utils/remarkInlineTags';
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
 * A code block scrolls sideways rather than wrapping (code keeps its lines),
 * so, like a table, it is a named, focusable region: axe fails a scroller
 * the keyboard cannot reach (`scrollable-region-focusable`), found by the
 * print harness scene's long shell line (2026-09-30).
 */
// eslint-disable-next-line no-unused-vars -- `node` is react-markdown's AST node; keep it off the DOM
function ScrollingPre({ node, ...props }) {
    return <pre role="region" aria-label="Code block" tabIndex={0} {...props} />;
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

/**
 * Links. An inline `#tag` (remarkInlineTags) is an in-app route, so it goes
 * through the router — a plain `<a href="/tags/…">` would reload the whole
 * PWA. Everything else is the plain anchor react-markdown would have made.
 */
// eslint-disable-next-line no-unused-vars, react-refresh/only-export-components -- `node` is react-markdown's AST node; keep it off the DOM
function MarkdownLink({ node, href, children, ...props }) {
    const inRouter = useInRouterContext();
    if (inRouter && typeof href === 'string' && href.startsWith('/tags/')) {
        return <RouterLink to={href} {...props}>{children}</RouterLink>;
    }
    return <a href={href} {...props}>{children}</a>;
}

export const MARKDOWN_COMPONENTS = { table: ScrollingTable, pre: ScrollingPre, input: TaskBox, a: MarkdownLink };

/** GFM (tables, task lists) plus inline `#tags` as links to their tag page. */
export const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkInlineTags];

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
    '& pre[tabindex]:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
    // An inline #tag: a quiet link in secondary ink, not a loud blue one.
    '& a.ng-inline-tag': {
        color: 'text.secondary',
        fontWeight: 500,
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline', color: 'text.primary' },
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
