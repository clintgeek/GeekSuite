import React, { memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeNoteHtml } from '../../utils/sanitizeNoteHtml';
import { decodeCodeNote } from '../../utils/previewText';
import { toDate } from '../../utils/dateUtils';
import { mindMapOutline } from '../../utils/printNote';
import './notePrint.css';

/**
 * NotePrintView — the note as it goes to paper (DOCS/CONTEXT.md §8).
 *
 * Portalled to `<body>` and `display: none` on screen. In print,
 * notePrint.css hides every other child of `<body>` — the app, MUI's menus,
 * dialogs and backdrops, toasts — so only this prints, black on white, in
 * the page's normal flow (the app's own layout is a fixed-height frame that
 * would print one screenful). Because it is always mounted while a note is
 * open, the browser's own Print (Ctrl+P, the menu) prints the note too.
 *
 * Per type:
 *   markdown    rendered, tables as real tables, links followed by their URL
 *   text        the sanitized rich-text HTML (plain legacy bodies wrap)
 *   code        monospace, long lines wrapped, language in the meta line
 *   mindmap     a nested outline (utils/printNote.js#mindMapOutline)
 *   handwritten `sketchImages`, exported by the page just before printing;
 *               a photo sketch is one image per photographed page
 */

const PRINT_ROOT_CLASS = 'ng-print-root';

const isWebUrl = (href) => /^(https?:|mailto:)/i.test(String(href || ''));

const textOf = (children) => React.Children.toArray(children)
  .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : textOf(c?.props?.children)))
  .join('');

/* eslint-disable no-unused-vars -- `node` is react-markdown's AST node; keep it off the DOM */
function PrintLink({ node, href, children, ...props }) {
  const shown = textOf(children).trim();
  const bare = String(href || '').replace(/^mailto:/i, '');
  return (
    <>
      <a href={href} {...props}>{children}</a>
      {isWebUrl(href) && shown !== href && shown !== bare ? (
        <span className="ng-print-url"> ({bare})</span>
      ) : null}
    </>
  );
}

function PrintTaskBox({ node, type, checked, ...props }) {
  if (type !== 'checkbox') return <input type={type} {...props} />;
  return <span className="ng-print-task" aria-label={checked ? 'Done' : 'Not done'}>{checked ? '☑' : '☐'} </span>;
}
/* eslint-enable no-unused-vars */

const PRINT_MARKDOWN_COMPONENTS = { a: PrintLink, input: PrintTaskBox };

function formatUpdated(value) {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Outline({ items }) {
  if (!items.length) return null;
  return (
    <ul>
      {items.map((it) => (
        <li key={it.id}>
          {it.label}
          <Outline items={it.children} />
        </li>
      ))}
    </ul>
  );
}

const looksLikeHtml = (s) => /<([a-z][a-z0-9]*)\b[^>]*>/i.test(s || '');

function PrintBody({ type, content, sketchImages, sketchError }) {
  switch (type) {
    case 'markdown':
      return (
        <div className="ng-print-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={PRINT_MARKDOWN_COMPONENTS}>
            {content || ''}
          </ReactMarkdown>
        </div>
      );
    case 'code': {
      const { code } = decodeCodeNote(content || '');
      return <pre className="ng-print-code"><code>{code}</code></pre>;
    }
    case 'mindmap': {
      const outline = mindMapOutline(content);
      if (!outline.length) return <p className="ng-print-empty">This mind map is empty.</p>;
      return (
        <div className="ng-print-outline">
          <p className="ng-print-aside">Mind map, as an outline.</p>
          <Outline items={outline} />
        </div>
      );
    }
    case 'handwritten':
      if (sketchImages?.length) {
        return (
          <div className="ng-print-sketch">
            {sketchImages.map((img, i) => (
              <img
                key={img.url}
                src={img.url}
                width={img.width}
                height={img.height}
                alt={sketchImages.length > 1 ? `Page ${i + 1} of the sketch` : 'The sketch'}
              />
            ))}
          </div>
        );
      }
      return (
        <p className="ng-print-empty">
          {sketchError
            || 'The drawing is added when you print from NoteGeek: ⋯ → Print or save as PDF, or Ctrl+P.'}
        </p>
      );
    case 'text':
    default:
      // Stored TipTap HTML, sanitized by the app's one profile. A legacy
      // plain body (no tags) keeps its line breaks.
      if (!looksLikeHtml(content)) {
        return <div className="ng-print-plain">{content || ''}</div>;
      }
      return (
        <div
          className="ng-print-rich"
          dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(content || '') }}
        />
      );
  }
}

/**
 * @param {object} props
 * @param {{ title?: string, type?: string, content?: string, tags?: string[], updatedAt?: any }} props.note
 * @param {Array<{ url: string, width?: number, height?: number }>} [props.sketchImages]
 * @param {string} [props.sketchError]  shown instead of the drawing
 * @param {React.Ref} [props.rootRef]   useNotePrint's, so it can wait for images
 */
function NotePrintView({ note, sketchImages = null, sketchError = null, rootRef = null }) {
  // The editor re-renders this on every keystroke; paper can lag a frame.
  const content = useDeferredValue(note?.content || '');
  if (typeof document === 'undefined') return null;
  const type = note?.type || 'text';
  const updated = formatUpdated(note?.updatedAt);
  const tags = (note?.tags || []).filter(Boolean);
  const language = type === 'code' ? decodeCodeNote(content).language : null;
  const meta = [
    updated ? `Updated ${updated}` : null,
    language ? language : null,
    tags.length ? tags.join(' · ') : null,
  ].filter(Boolean);

  return createPortal(
    <article className={PRINT_ROOT_CLASS} ref={rootRef} data-note-print>
      <header className="ng-print-head">
        <h1 className="ng-print-title">{note?.title?.trim() || 'Untitled note'}</h1>
        {meta.length ? <p className="ng-print-meta">{meta.join('  ·  ')}</p> : null}
      </header>
      <PrintBody type={type} content={content} sketchImages={sketchImages} sketchError={sketchError} />
    </article>,
    document.body,
  );
}

export default memo(NotePrintView);
