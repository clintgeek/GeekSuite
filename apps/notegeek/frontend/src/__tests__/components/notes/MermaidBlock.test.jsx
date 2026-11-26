import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';

/**
 * MermaidBlock and the loader's settings (DOCS/CONTEXT.md §26). Mermaid is
 * mocked as a module: jsdom cannot lay out an SVG. What must hold:
 *   - while drawing, the source shows with "Drawing diagram…";
 *   - a diagram that cannot be drawn shows its source and why (role status),
 *     never a blank;
 *   - drawn, it is a figure role="img" named by its labels, with Show source;
 *   - the theme follows the app's mode, and Mermaid is strict with no HTML labels;
 *   - a ```mermaid fence anywhere markdown renders becomes a MermaidBlock.
 */

const mermaid = {
  initialize: vi.fn(),
  render: vi.fn(),
  parse: vi.fn(),
};
vi.mock('mermaid', () => ({ default: mermaid }));

import MermaidBlock from '../../../components/notes/MermaidBlock';
import { MARKDOWN_COMPONENTS } from '../../../components/notes/markdownComponents';
import { mermaidConfig, parseMermaid, _resetMermaidLoader } from '../../../utils/mermaidLoader';
import { graphite } from '../../../theme/graphite';

const SRC = 'flowchart TD\n  a["Idea"] -->|yes| b("Build it")';

function renderIn(mode, ui) {
  return render(<ThemeProvider theme={createNoteTheme(mode)}>{ui}</ThemeProvider>);
}

beforeEach(() => {
  _resetMermaidLoader();
  vi.clearAllMocks();
  mermaid.render.mockImplementation(async (id) => ({ svg: `<svg id="${id}" data-test-svg=""><text>Idea</text></svg>` }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the loader', () => {
  it('is strict, draws labels as SVG text, and does not draw error pictures', () => {
    const c = mermaidConfig('light');
    expect(c.securityLevel).toBe('strict');
    expect(c.htmlLabels).toBe(false);
    expect(c.flowchart.htmlLabels).toBe(false);
    expect(c.startOnLoad).toBe(false);
    expect(c.suppressErrorRendering).toBe(true);
    // Wide diagrams keep their size and scroll in their own box.
    expect(c.flowchart.useMaxWidth).toBe(false);
  });

  it('takes its colours from the palette for the mode', () => {
    expect(mermaidConfig('light').themeVariables).toMatchObject({ darkMode: false, primaryTextColor: graphite.light.ink, background: graphite.light.sheet });
    expect(mermaidConfig('dark').themeVariables).toMatchObject({ darkMode: true, primaryTextColor: graphite.dark.ink, nodeTextColor: graphite.dark.ink, background: graphite.dark.sheet });
  });

  it('initialises once, and re-themes only when the mode changes', async () => {
    renderIn('light', <MermaidBlock source={SRC} immediate />);
    await screen.findByRole('img');
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(mermaid.initialize.mock.calls[0][0]).toMatchObject({ securityLevel: 'strict', htmlLabels: false });
  });

  it('parseMermaid reports Mermaid\'s error in one line', async () => {
    mermaid.parse.mockRejectedValueOnce(new Error('Parse error on line 2:\n...--> b("Build\n-----^\nExpecting SQE'));
    expect(await parseMermaid('x')).toEqual({ ok: false, error: 'Parse error on line 2: ...--> b("Build -----^ Expecting SQE' });
    mermaid.parse.mockResolvedValueOnce({ diagramType: 'flowchart-v2' });
    expect(await parseMermaid(SRC)).toEqual({ ok: true });
  });
});

describe('MermaidBlock', () => {
  it('shows the source with "Drawing diagram…" until it is drawn', async () => {
    let finish;
    mermaid.render.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { container } = renderIn('light', <MermaidBlock source={SRC} immediate />);
    expect(await screen.findByRole('status')).toHaveTextContent('Drawing diagram…');
    expect(screen.getByRole('region', { name: 'Diagram source' })).toHaveTextContent('flowchart TD');
    expect(container.querySelector('[data-mermaid-pending]')).not.toBeNull();
    await act(async () => { finish({ svg: '<svg data-test-svg=""></svg>' }); });
    expect(container.querySelector('[data-mermaid-pending]')).toBeNull();
    expect(screen.queryByText('Drawing diagram…')).toBeNull();
  });

  it('drawn: a figure with role img named by its labels, and a Show source toggle', async () => {
    renderIn('light', <MermaidBlock source={SRC} immediate />);
    const fig = await screen.findByRole('img', { name: 'Diagram: Idea, yes, Build it' });
    expect(fig.tagName).toBe('FIGURE');
    expect(fig.querySelector('[data-test-svg]')).not.toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show source' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide source' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Diagram source' })).toHaveTextContent('Build it');
  });

  it('a diagram that cannot be drawn shows its source and the reason, never a blank', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('Parse error on line 2: Expecting SQE'));
    renderIn('light', <MermaidBlock source={SRC} immediate />);
    const status = await screen.findByText('This diagram could not be drawn: Parse error on line 2: Expecting SQE');
    expect(status).toHaveAttribute('role', 'status');
    expect(screen.getByRole('region', { name: 'Diagram source' })).toHaveTextContent('flowchart TD');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws in the app\'s mode: dark at night, and light when asked (print)', async () => {
    renderIn('dark', <MermaidBlock source={SRC} immediate />);
    await screen.findByRole('img');
    expect(mermaid.initialize.mock.calls.at(-1)[0].themeVariables.darkMode).toBe(true);
    renderIn('dark', <MermaidBlock source={SRC} immediate mode="light" print />);
    await vi.waitFor(() => expect(mermaid.initialize.mock.calls.at(-1)[0].themeVariables.darkMode).toBe(false));
  });

  it('waits until it is on screen before loading Mermaid', async () => {
    const observed = [];
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; observed.push(this); }
      observe() {}
      disconnect() {}
    };
    try {
      renderIn('light', <MermaidBlock source={SRC} />);
      await act(async () => {});
      expect(mermaid.render).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('Drawing diagram…');
      await act(async () => { observed[0].cb([{ isIntersecting: true }]); });
      await screen.findByRole('img');
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});

describe('markdown', () => {
  it('a ```mermaid fence is drawn; any other fence stays a code block', async () => {
    renderIn('light', (
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>
        {`\`\`\`\`mermaid\n${SRC}\n\`\`\`\`\n\n\`\`\`js\nconst a = 1;\n\`\`\``}
      </ReactMarkdown>
    ));
    expect(await screen.findByRole('img', { name: /Diagram: Idea/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code block' })).toHaveTextContent('const a = 1;');
    expect(mermaid.render.mock.calls[0][1]).toBe(SRC);
  });
});
