/**
 * The compose preview.
 *
 * Compose is lossy by design, so unlike Tidy it never writes straight back
 * over the source — the source may be the only copy of material pasted in
 * from a chat or an email. The result is shown and the user decides.
 *
 * The case that matters most is a partial failure: a batch of the material
 * that could not be read leaves a document which still LOOKS complete. That
 * has to be said before the user picks an action, not after.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComposeDialog from '../../components/editors/ComposeDialog';

const stats = (over = {}) => ({
  inputChars: 4000, fragments: 12, chunks: 3, chunksFailed: 0, strategy: 'map_reduce', ...over,
});

const props = (over = {}) => ({
  open: true,
  loading: false,
  markdown: '# Roof repair plan\n\n- a point',
  stats: stats(),
  error: null,
  onClose: vi.fn(),
  onSaveAsNew: vi.fn(),
  onReplace: vi.fn(),
  ...over,
});

describe('the result', () => {
  it('renders the composed markdown', () => {
    // A fixture heading distinct from the dialog's own "Composed document"
    // title, so this asserts the rendered document rather than the chrome.
    render(<ComposeDialog {...props()} />);
    expect(screen.getByRole('heading', { name: /roof repair plan/i })).toBeInTheDocument();
    expect(screen.getByText('a point')).toBeInTheDocument();
  });

  it('renders tables, since composed documents contain them', () => {
    render(<ComposeDialog {...props({ markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |' })} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows what it did', () => {
    render(<ComposeDialog {...props()} />);
    expect(screen.getByText(/12 fragments/i)).toBeInTheDocument();
    expect(screen.getByText(/3 batches/i)).toBeInTheDocument();
  });

  it('says "one pass" for material small enough to see whole', () => {
    render(<ComposeDialog {...props({ stats: stats({ strategy: 'single', chunks: 1 }) })} />);
    expect(screen.getByText(/one pass/i)).toBeInTheDocument();
  });
});

describe('a partial failure is stated before the document', () => {
  it('warns that material is missing', () => {
    render(<ComposeDialog {...props({ stats: stats({ chunksFailed: 1 }) })} />);
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/original note is untouched/i)).toBeInTheDocument();
  });

  it('does not warn when nothing failed', () => {
    render(<ComposeDialog {...props()} />);
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });
});

describe('nothing is written by the dialog itself', () => {
  it('offers save-as-new as the primary action', () => {
    render(<ComposeDialog {...props()} />);
    expect(screen.getByRole('button', { name: /save as a new note/i })).toBeInTheDocument();
  });

  it('calls back on save-as-new', () => {
    const onSaveAsNew = vi.fn();
    render(<ComposeDialog {...props({ onSaveAsNew })} />);
    fireEvent.click(screen.getByRole('button', { name: /save as a new note/i }));
    expect(onSaveAsNew).toHaveBeenCalledTimes(1);
  });

  it('calls back on replace', () => {
    const onReplace = vi.fn();
    render(<ComposeDialog {...props({ onReplace })} />);
    fireEvent.click(screen.getByRole('button', { name: /replace this note/i }));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('discards without calling either', () => {
    const onSaveAsNew = vi.fn();
    const onReplace = vi.fn();
    const onClose = vi.fn();
    render(<ComposeDialog {...props({ onSaveAsNew, onReplace, onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onSaveAsNew).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });
});

describe('no result means no way to commit one', () => {
  it('disables both actions while loading', () => {
    render(<ComposeDialog {...props({ loading: true, markdown: '' })} />);
    expect(screen.getByRole('button', { name: /save as a new note/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /replace this note/i })).toBeDisabled();
  });

  it('disables both actions on an error', () => {
    render(<ComposeDialog {...props({ markdown: '', error: 'Compose is unavailable right now.' })} />);
    expect(screen.getByText(/unavailable right now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as a new note/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /replace this note/i })).toBeDisabled();
  });

  it('disables both actions when nothing came back', () => {
    render(<ComposeDialog {...props({ markdown: '' })} />);
    expect(screen.getByText(/nothing came back/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace this note/i })).toBeDisabled();
  });
});
