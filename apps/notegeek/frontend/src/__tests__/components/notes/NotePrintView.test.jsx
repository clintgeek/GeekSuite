import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import NotePrintView from '../../../components/notes/NotePrintView';

/**
 * The paper copy of a note (DOCS/CONTEXT.md §8), one test per type. It is
 * portalled to <body> and hidden on screen by notePrint.css (jsdom applies
 * no stylesheet), so these read the portal directly.
 */
const printRoot = () => {
  const el = document.body.querySelector(':scope > .ng-print-root');
  if (!el) throw new Error('no print root on <body>');
  return el;
};

const MARKDOWN = [
  '# Plan',
  '',
  'See [the spec](https://example.com/spec) and <https://example.com/raw>.',
  '',
  '| Step | Owner |',
  '| --- | --- |',
  '| Build | Chef |',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '> quoted',
  '',
  '- [x] done',
  '- [ ] not yet',
].join('\n');

describe('NotePrintView', () => {
  it('is a direct child of <body>, with the title and a meta line', () => {
    render(
      <NotePrintView note={{ title: 'Groceries', type: 'markdown', content: 'milk', tags: ['home', 'weekly'], updatedAt: '2026-09-20T12:00:00.000Z' }} />,
    );
    const root = printRoot();
    expect(within(root).getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument();
    const meta = root.querySelector('.ng-print-meta').textContent;
    expect(meta).toMatch(/^Updated /);
    expect(meta).toMatch(/2026/);
    expect(meta).toContain('home · weekly');
  });

  it('markdown: rendered, with a real table, code, a quote, and link URLs printed', () => {
    render(<NotePrintView note={{ title: 'Plan', type: 'markdown', content: MARKDOWN }} />);
    const root = printRoot();
    expect(root.querySelector('.ng-print-md h1').textContent).toBe('Plan');
    const table = root.querySelector('table');
    expect(table).not.toBeNull();
    expect(within(table).getByRole('cell', { name: 'Chef' })).toBeInTheDocument();
    // Not the screen's scrolling wrapper: paper has no scrollbars.
    expect(root.querySelector('.md-table-scroll')).toBeNull();
    expect(root.querySelector('pre code').textContent).toContain('const x = 1;');
    expect(root.querySelector('blockquote').textContent).toContain('quoted');
    // The link's URL follows it; an autolink (text === URL) does not repeat itself.
    const urls = [...root.querySelectorAll('.ng-print-url')].map((n) => n.textContent);
    expect(urls).toEqual([' (https://example.com/spec)']);
    // Task boxes are glyphs, not dead form controls.
    expect(root.querySelector('input')).toBeNull();
    expect(root.textContent).toContain('☑');
    expect(root.textContent).toContain('☐');
  });

  it('a note of a type that is no longer offered prints as a markdown note', () => {
    render(<NotePrintView note={{ title: 'Old', type: 'mindmap', content: '# Heading\n\nbody' }} />);
    const root = printRoot();
    expect(root.querySelector('.ng-print-md h1').textContent).toBe('Heading');
  });

  it('sketch: the exported images, one per page', () => {
    render(
      <NotePrintView
        note={{ title: 'Photos', type: 'handwritten', content: '{}' }}
        sketchImages={[{ url: 'blob:a', width: 1000, height: 1400 }, { url: 'blob:b', width: 1000, height: 1400 }]}
      />,
    );
    const imgs = [...printRoot().querySelectorAll('.ng-print-sketch img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['blob:a', 'blob:b']);
    expect(imgs[0]).toHaveAttribute('alt', 'Page 1 of the handwriting');
  });

  it('sketch without an export says so honestly, and shows the error when there is one', () => {
    const { rerender } = render(<NotePrintView note={{ title: 'S', type: 'handwritten', content: '{}' }} />);
    expect(printRoot().textContent).toMatch(/print from NoteGeek/i);
    rerender(<NotePrintView note={{ title: 'S', type: 'handwritten', content: '{}' }} sketchError="This sketch is empty." />);
    expect(printRoot().textContent).toContain('This sketch is empty.');
  });
});
