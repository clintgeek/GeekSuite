import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';
import EditorToolbar, { ToolButton } from '../../../components/editors/EditorToolbar';
import NoteShell from '../../../components/notes/NoteShell';
import useEditorChrome from '../../../store/editorChromeStore';

const theme = createNoteTheme('light');

/** matchMedia that says "phone" (below md) or not. */
function setPhone(isPhone) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isPhone && /max-width/.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  delete window.visualViewport;
  useEditorChrome.getState().reset();
});

function renderBar() {
  return render(
    <ThemeProvider theme={theme}>
      <div data-testid="page">
        <EditorToolbar label="Formatting">
          <ToolButton label="Bold" onClick={() => {}}>B</ToolButton>
        </EditorToolbar>
      </div>
    </ThemeProvider>
  );
}

describe('EditorToolbar', () => {
  it('on a phone, docks to the bottom of the screen, outside the page, above the keyboard', () => {
    setPhone(true);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const listeners = {};
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 500,
        offsetTop: 0,
        addEventListener: (t, fn) => { listeners[t] = fn; },
        removeEventListener: () => {},
      },
    });
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(bar).toHaveAttribute('data-editor-toolbar', 'docked');
    // Portalled: not inside the page's own tree (a transformed ancestor
    // would otherwise capture position: fixed).
    expect(screen.getByTestId('page')).not.toContainElement(bar);
    const style = getComputedStyle(bar);
    expect(style.position).toBe('fixed');
    expect(style.bottom).toBe('300px');
  });

  it('on desktop, is an inline sticky strip in the page', () => {
    setPhone(false);
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(bar).toHaveAttribute('data-editor-toolbar', 'inline');
    expect(screen.getByTestId('page')).toContainElement(bar);
  });

  it('a tap on a tool does not take the caret out of the text', () => {
    setPhone(false);
    renderBar();
    const button = screen.getByRole('button', { name: 'Bold' });
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('repeats a loud save alert in the docked bar, with its Retry', () => {
    setPhone(true);
    const retry = vi.fn();
    act(() => { useEditorChrome.getState().setSaveAlert({ tone: 'error', detail: 'Network down' }, retry); });
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(bar.querySelector('[data-save-alert="error"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('NoteShell writing focus', () => {
  it('reports writing while the caret is in the note, and not once it leaves', () => {
    setPhone(true);
    render(
      <ThemeProvider theme={theme}>
        <NoteShell header={<input aria-label="Note title" />}>
          <textarea aria-label="Note body" />
          <button type="button">A button</button>
        </NoteShell>
        <button type="button">Outside</button>
      </ThemeProvider>
    );
    expect(useEditorChrome.getState().writing).toBe(false);
    act(() => { screen.getByLabelText('Note body').focus(); });
    expect(useEditorChrome.getState().writing).toBe(true);
    // Title to body and back stays "writing".
    act(() => { screen.getByLabelText('Note title').focus(); });
    expect(useEditorChrome.getState().writing).toBe(true);
    act(() => { screen.getByRole('button', { name: 'Outside' }).focus(); });
    expect(useEditorChrome.getState().writing).toBe(false);
  });
});
