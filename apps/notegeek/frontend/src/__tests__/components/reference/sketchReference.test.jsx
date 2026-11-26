import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';

/**
 * SketchReference reads a handwritten note for the pane. A body it cannot read
 * is said out loud, never shown as a blank page, and never throws.
 */
const tl = vi.hoisted(() => ({ editors: [], loadSnapshot: null }));

vi.mock('@tldraw/tldraw', async () => {
  const React = await import('react');
  tl.loadSnapshot = vi.fn();
  function Tldraw({ onMount }) {
    React.useEffect(() => {
      const editor = {
        store: { mergeRemoteChanges: (fn) => fn() },
        updateInstanceState: vi.fn(),
        setCurrentTool: vi.fn(),
        updateViewportScreenBounds: vi.fn(),
        getContainer: () => null,
      };
      tl.editors.push(editor);
      onMount?.(editor);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid="tldraw-stub" />;
  }
  return {
    Tldraw, Box: class {}, loadSnapshot: tl.loadSnapshot, useEditor: () => ({}), useTldrawUser: () => ({}),
  };
});
vi.mock('../../../components/editors/usePaper', () => ({ usePaper: () => ({ look: {} }) }));
vi.mock('../../../components/editors/Paper', () => ({ PaperBackground: () => null }));

import SketchReference from '../../../components/reference/SketchReference';

const SNAP = JSON.stringify({ store: { 'page:page': { id: 'page:page', typeName: 'page' } }, schema: {} });
const wrap = (content) => (
  <ThemeProvider theme={createNoteTheme('light')}><SketchReference content={content} /></ThemeProvider>
);

describe('SketchReference with a body it cannot read', () => {
  it.each([['invalid JSON', 'nope'], ['a truncated body', SNAP.slice(0, 20)], ['{}', '{}']])('%s: says so, never throws, never loads', async (_, body) => {
    tl.loadSnapshot.mockClear();
    render(wrap(body));
    expect(await screen.findByTestId('reference-unreadable')).toHaveTextContent('This note could not be read');
    expect(tl.loadSnapshot).not.toHaveBeenCalled();
  });

  it('a snapshot tldraw rejects is the same', async () => {
    // (the load is attempted on mount and again by the content effect: reject both)
    tl.loadSnapshot.mockImplementation(() => { throw new Error('migration failed'); });
    render(wrap(SNAP));
    expect(await screen.findByTestId('reference-unreadable')).toBeInTheDocument();
    tl.loadSnapshot.mockReset();
  });

  it('a readable body shows no message, and moving to a readable note clears one', async () => {
    const { rerender } = render(wrap('nope'));
    await screen.findByTestId('reference-unreadable');
    rerender(wrap(SNAP));
    await waitFor(() => expect(screen.queryByTestId('reference-unreadable')).not.toBeInTheDocument());
  });
});
