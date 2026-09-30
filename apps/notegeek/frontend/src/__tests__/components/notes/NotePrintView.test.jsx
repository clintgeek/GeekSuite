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

  it('rich text: the sanitized HTML', () => {
    render(
      <NotePrintView note={{ title: 'Rich', type: 'text', content: '<h2>Hello</h2><p>Body <strong>bold</strong></p><script>window.bad=1</script>' }} />,
    );
    const root = printRoot();
    expect(root.querySelector('.ng-print-rich h2').textContent).toBe('Hello');
    expect(root.querySelector('strong').textContent).toBe('bold');
    expect(root.querySelector('script')).toBeNull();
  });

  it('a legacy plain body keeps its line breaks', () => {
    render(<NotePrintView note={{ title: 'Old', type: null, content: 'line one\nline two' }} />);
    const plain = printRoot().querySelector('.ng-print-plain');
    expect(plain.textContent).toBe('line one\nline two');
  });

  it('code: the code, not the JSON envelope, and its language in the meta line', () => {
    const content = JSON.stringify({ language: 'python', code: 'def f():\n    return 1' });
    render(<NotePrintView note={{ title: 'Snippet', type: 'code', content }} />);
    const root = printRoot();
    expect(root.querySelector('pre.ng-print-code code').textContent).toBe('def f():\n    return 1');
    expect(root.textContent).not.toContain('"language"');
    expect(root.querySelector('.ng-print-meta').textContent).toContain('python');
  });

  it('mind map: a nested outline', () => {
    const content = JSON.stringify({
      nodes: [
        { id: '0', position: { x: 0, y: 0 }, data: { label: 'GeekSuite', isRoot: true } },
        { id: '1', position: { x: 0, y: 10 }, data: { label: 'NoteGeek' } },
      ],
      edges: [{ id: 'e', source: '0', target: '1' }],
    });
    render(<NotePrintView note={{ title: 'Map', type: 'mindmap', content }} />);
    const root = printRoot();
    const top = root.querySelector('.ng-print-outline > ul > li');
    expect(top.firstChild.textContent).toBe('GeekSuite');
    expect(top.querySelector('ul > li').textContent).toBe('NoteGeek');
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
    expect(imgs[0]).toHaveAttribute('alt', 'Page 1 of the sketch');
  });

  it('sketch without an export says so honestly, and shows the error when there is one', () => {
    const { rerender } = render(<NotePrintView note={{ title: 'S', type: 'handwritten', content: '{}' }} />);
    expect(printRoot().textContent).toMatch(/print from NoteGeek/i);
    rerender(<NotePrintView note={{ title: 'S', type: 'handwritten', content: '{}' }} sketchError="This sketch is empty." />);
    expect(printRoot().textContent).toContain('This sketch is empty.');
  });
});
