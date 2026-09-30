/**
 * Pipe tables render as tables.
 *
 * Both markdown surfaces called `<ReactMarkdown>` with no `remarkPlugins`, so
 * only CommonMark was parsed — and CommonMark has no tables. A pipe table came
 * out as a single paragraph of literal pipes, every row folded onto one line,
 * because consecutive lines in a paragraph join with a space.
 *
 * The giveaway was that both call sites already carried full `& th` / `& td`
 * styling: someone had written the CSS for tables the parser could never
 * produce.
 *
 * The fixture is taken from a real note (an interview-process doc) rather than
 * invented, because the failure only shows on a table that has content worth
 * reading.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// A right-aligned column and an em dash — both real, both from the note.
const TABLE = `| Interviewer | Notice | Context |
|---|---:|---|
| Gigi Canova | ~1 day | SR QE interview scheduled Tuesday for Wednesday |
| Vanessa Bentes | 1 day | QA Senior interview: notice 9/15, interview 9/16 |
`;

const renderMd = (source, plugins) =>
  render(<ReactMarkdown remarkPlugins={plugins}>{source}</ReactMarkdown>);

describe('a pipe table', () => {
  it('becomes a real table element', () => {
    renderMd(TABLE, [remarkGfm]);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('keeps each row separate', () => {
    renderMd(TABLE, [remarkGfm]);
    // Header + two body rows. Flattened, this was one paragraph.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('puts the header cells in a header row', () => {
    renderMd(TABLE, [remarkGfm]);
    const headers = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(headers).toEqual(['Interviewer', 'Notice', 'Context']);
  });

  it('does not leak the delimiter row into the output', () => {
    // `|---|---:|---|` is syntax, not content. It rendered as visible text.
    renderMd(TABLE, [remarkGfm]);
    expect(screen.queryByText(/---/)).not.toBeInTheDocument();
  });

  it('renders no literal pipes', () => {
    renderMd(TABLE, [remarkGfm]);
    expect(screen.getByRole('table').textContent).not.toContain('|');
  });

  it('WITHOUT the plugin it is one flattened paragraph — the bug', () => {
    // Pinning the old behaviour so the fix cannot be quietly removed: this is
    // what the note actually looked like.
    const { container } = renderMd(TABLE, []);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('|');
    // Every row on one line, which is why it read as a wall of pipes.
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});

describe('the rest of GFM the note relies on', () => {
  it('renders a task list', () => {
    const { container } = renderMd('- [ ] not done\n- [x] done\n', [remarkGfm]);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('renders strikethrough', () => {
    const { container } = renderMd('~~struck~~', [remarkGfm]);
    expect(container.querySelector('del')).not.toBeNull();
  });
});

describe('what GFM does NOT change', () => {
  it('leaves paragraph folding alone', () => {
    // `remark-breaks` is the plugin that turns a single newline into a <br>,
    // and it is deliberately NOT added here: it would change how every
    // existing note renders, which is more than the reported bug asked for.
    // Pinned so that decision is visible rather than assumed.
    const { container } = renderMd('line one\nline two', [remarkGfm]);
    expect(container.querySelectorAll('br')).toHaveLength(0);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('still renders fenced code blocks', () => {
    const { container } = renderMd('```text\nflow\n```', [remarkGfm]);
    expect(container.querySelector('pre')).not.toBeNull();
  });
});

describe('a code block', () => {
  it('is a named region the keyboard can reach, since it scrolls sideways', async () => {
    const { MARKDOWN_COMPONENTS } = await import('../../components/notes/markdownComponents');
    render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {'```sh\ndocker compose up -d --force-recreate --no-deps notegeek\n```'}
      </ReactMarkdown>
    );
    const pre = screen.getByRole('region', { name: 'Code block' });
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveAttribute('tabindex', '0');
  });
});

describe('a task list', () => {
  it('shows each box as a named state, not an unlabelled 13px checkbox', async () => {
    const { MARKDOWN_COMPONENTS } = await import('../../components/notes/markdownComponents');
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {'- [ ] ask Heather\n- [x] call the roofer\n'}
      </ReactMarkdown>
    );
    expect(container.querySelector('input')).toBeNull();
    expect(screen.getByRole('img', { name: 'Not done' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText('ask Heather')).toBeInTheDocument();
  });
});
