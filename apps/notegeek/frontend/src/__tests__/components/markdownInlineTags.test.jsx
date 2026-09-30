/**
 * Inline #tags in rendered Markdown are tappable links to their tag page —
 * through the router, not a full reload — and nothing else becomes one.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { MARKDOWN_COMPONENTS, MARKDOWN_REMARK_PLUGINS } from '../../components/notes/markdownComponents';

const renderMd = (source, { router = true } = {}) => {
  const md = <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{source}</ReactMarkdown>;
  return render(router ? <MemoryRouter>{md}</MemoryRouter> : md);
};

const tagLinks = (container) => [...container.querySelectorAll('a.ng-inline-tag')];

describe('inline #tags in the Markdown renderer', () => {
  it('links each tag to its page, keeping the text as written', () => {
    const { container } = renderMd('Buy nails #house/garage, then (#garden).');
    const links = tagLinks(container);
    expect(links.map((a) => a.textContent)).toEqual(['#house/garage', '#garden']);
    expect(links[0]).toHaveAttribute('href', '/tags/house%2Fgarage');
    expect(links[0]).toHaveAttribute('data-tag', 'house/garage');
    expect(screen.getByText(/Buy nails/)).toBeInTheDocument();
  });

  it('never links code, headings, colours, digits, anchors or URLs', () => {
    const { container } = renderMd([
      '# Heading',
      '',
      '`#inline` and #fff and #1',
      '',
      '```',
      '#fenced',
      '```',
      '',
      '[anchor](#section) and https://x.com/#frag and [#inlink](https://x.com)',
      '',
      '**bold**#glued',
    ].join('\n'));
    expect(tagLinks(container)).toEqual([]);
  });

  it('a tag in a heading line (after the marker) still links', () => {
    const { container } = renderMd('## Kitchen #house');
    expect(tagLinks(container).map((a) => a.textContent)).toEqual(['#house']);
  });

  it('a trailing slash is not part of the link', () => {
    const { container } = renderMd('see #house/ now');
    expect(tagLinks(container)[0]).toHaveTextContent(/^#house$/);
  });

  it('outside a router it is still a plain link, not a crash', () => {
    const { container } = renderMd('#house', { router: false });
    expect(tagLinks(container)[0]).toHaveAttribute('href', '/tags/house');
  });

  it('ordinary links are unchanged', () => {
    renderMd('[site](https://example.com)');
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.com');
  });
});
