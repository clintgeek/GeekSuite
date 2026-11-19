import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';
import EditorToolbar, { ToolButton } from '../../../components/editors/EditorToolbar';
import NoteShell from '../../../components/notes/NoteShell';
import useEditorChrome from '../../../store/editorChromeStore';
import { VIEWPORTS, restoreViewport, setViewport } from '../../helpers/viewport';

const theme = createNoteTheme('light');

/**
 * A phone (390 px; matchMedia says "below md") or a 1280 px desktop. The
 * toolbar follows `useFormFactor` (pointer AND size) since the tablet wave,
 * so the window size has to agree with the queries.
 */
function setPhone(isPhone) {
  Object.defineProperty(window, 'innerWidth', { value: isPhone ? 390 : 1280, configurable: true, writable: true });
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
  restoreViewport();
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

  // Tablet wave 2026-11-16: an 800x1280 touch tablet is not a phone. Its
  // toolbar sits under the title like landscape's, not docked bottom-left.
  it.each([
    ['portrait tablet (800x1280, touch)', VIEWPORTS.tabletPortrait],
    ['landscape tablet (1280x800, touch)', VIEWPORTS.tabletLandscape],
  ])('on a %s, is the inline strip in the page, not docked', (_name, vp) => {
    setViewport(vp);
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(bar).toHaveAttribute('data-editor-toolbar', 'inline');
    expect(screen.getByTestId('page')).toContainElement(bar);
  });

  it('a phone held sideways (844x390, touch) still docks', () => {
    setViewport({ width: 844, height: 390, coarse: true, fine: false, anyHover: false });
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toHaveAttribute('data-editor-toolbar', 'docked');
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

  // Review 2026-11-18 #3: a failed save was said up to four times.
  it('does not repeat the alert while the head\'s own alert is on screen', () => {
    setPhone(true);
    act(() => {
      useEditorChrome.getState().setSaveAlert({ tone: 'offline' }, vi.fn());
      useEditorChrome.getState().setAlertInView(true);
    });
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(bar.querySelector('[data-save-alert]')).toBeNull();
    // The head scrolls away: now the docked bar carries it.
    act(() => { useEditorChrome.getState().setAlertInView(false); });
    expect(bar.querySelector('[data-save-alert="offline"]')).not.toBeNull();
  });

  it('the docked copy is an icon and Retry, with no visible words to crowd the tools', () => {
    setPhone(true);
    act(() => { useEditorChrome.getState().setSaveAlert({ tone: 'offline' }, vi.fn()); });
    renderBar();
    const pill = screen.getByRole('toolbar', { name: 'Formatting' }).querySelector('[data-save-alert]');
    expect(pill).toHaveAttribute('data-save-alert-compact', 'true');
    const words = pill.querySelector('span:not([class*="MuiButtonBase"])');
    // The label is there for a screen reader, clipped off the screen.
    expect(pill).toHaveTextContent(/offline · not saved/);
    expect(getComputedStyle(words).position).toBe('absolute');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('SaveAlert in the head reports whether it is on screen', () => {
  it('sets alertInView while it is drawn, and clears it when the alert goes', async () => {
    const { SaveAlert } = await import('../../../components/notes/SaveStatus');
    const { rerender } = render(
      <ThemeProvider theme={theme}><SaveAlert error="Network down" reportInView onRetry={vi.fn()} /></ThemeProvider>
    );
    expect(useEditorChrome.getState().alertInView).toBe(true);
    rerender(<ThemeProvider theme={theme}><SaveAlert error={null} reportInView onRetry={vi.fn()} /></ThemeProvider>);
    expect(useEditorChrome.getState().alertInView).toBe(false);
  });

  it('follows the IntersectionObserver when there is one', async () => {
    let cb;
    const disconnect = vi.fn();
    window.IntersectionObserver = vi.fn(function IO(fn) { cb = fn; this.observe = vi.fn(); this.disconnect = disconnect; });
    try {
      const { SaveAlert } = await import('../../../components/notes/SaveStatus');
      render(<ThemeProvider theme={theme}><SaveAlert error="x" reportInView /></ThemeProvider>);
      act(() => cb([{ isIntersecting: true }]));
      expect(useEditorChrome.getState().alertInView).toBe(true);
      act(() => cb([{ isIntersecting: false }]));
      expect(useEditorChrome.getState().alertInView).toBe(false);
    } finally {
      delete window.IntersectionObserver;
    }
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
