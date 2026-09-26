// @vitest-environment jsdom
/**
 * Slash focus — the `/` shortcut's rules (focus/slashFocus.js).
 *
 * jsdom has no layout, so "visible" here is the display/visibility/hidden
 * half of the check; the has-a-box half is a real-browser concern.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import {
  installSlashFocus,
  findSlashFocusTarget,
  slashFocusProps,
} from '../focus/slashFocus.js';
import { GeekSlashHint, SlashFocusProvider } from '../focus/SlashFocus.jsx';
import { GeekSearchField } from '../primitives/GeekSearchField.jsx';
import { GeekShell } from '../navigation/GeekShell.jsx';
import { GeekTopBar } from '../navigation/GeekTopBar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let uninstall;

function mount(html) {
  document.body.innerHTML = html;
}

/** Dispatches a `/` keydown on `target` (default: body). Returns the event. */
function pressSlash(target = document.body, init = {}) {
  const event = new KeyboardEvent('keydown', {
    key: '/',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

const $ = (sel) => document.querySelector(sel);

describe('slash focus handler', () => {
  beforeEach(() => {
    uninstall = installSlashFocus(document);
  });
  afterEach(() => {
    uninstall?.();
    document.body.innerHTML = '';
  });

  it('focuses the marked input from the page body and prevents the "/"', () => {
    mount('<button id="b">x</button><input id="q" data-geek-slash-focus>');
    const event = pressSlash($('#b'));
    expect(document.activeElement).toBe($('#q'));
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ['input', '<input id="t">'],
    ['textarea', '<textarea id="t"></textarea>'],
    ['select', '<select id="t"><option>a</option></select>'],
    ['contenteditable', '<div id="t" contenteditable="true">x</div>'],
    ['role=textbox descendant', '<div role="textbox"><span id="t" tabindex="0">x</span></div>'],
    ['role=combobox', '<div id="t" role="combobox" tabindex="0"></div>'],
  ])('ignores "/" typed into a %s', (_label, html) => {
    mount(`${html}<input id="q" data-geek-slash-focus>`);
    const event = pressSlash($('#t'));
    expect(document.activeElement).not.toBe($('#q'));
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'])('ignores "/" with %s held', (mod) => {
    mount('<input id="q" data-geek-slash-focus>');
    const event = pressSlash(document.body, { [mod]: true });
    expect(document.activeElement).not.toBe($('#q'));
    expect(event.defaultPrevented).toBe(false);
  });

  it('allows Shift (some layouts need it to type "/")', () => {
    mount('<input id="q" data-geek-slash-focus>');
    pressSlash(document.body, { shiftKey: true });
    expect(document.activeElement).toBe($('#q'));
  });

  it('ignores "/" during IME composition', () => {
    mount('<input id="q" data-geek-slash-focus>');
    pressSlash(document.body, { isComposing: true });
    expect(document.activeElement).not.toBe($('#q'));
  });

  it('ignores other keys', () => {
    mount('<input id="q" data-geek-slash-focus>');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(document.activeElement).not.toBe($('#q'));
  });

  it('picks the highest visible priority; a bare attribute is 10', () => {
    mount(`
      <input id="bare" data-geek-slash-focus>
      <input id="hidden" data-geek-slash-focus="99" style="display:none">
      <div style="display:none"><input id="inHidden" data-geek-slash-focus="98"></div>
      <input id="invisible" data-geek-slash-focus="97" style="visibility:hidden">
      <input id="disabled" data-geek-slash-focus="96" disabled>
      <input id="twenty" data-geek-slash-focus="20">
      <input id="eleven" data-geek-slash-focus="11">
    `);
    pressSlash();
    expect(document.activeElement).toBe($('#twenty'));
  });

  it('breaks ties by DOM order', () => {
    mount('<input id="a" data-geek-slash-focus="20"><input id="b" data-geek-slash-focus="20">');
    pressSlash();
    expect(document.activeElement).toBe($('#a'));
  });

  it('skips candidates inside aria-hidden="true" or inert ancestors', () => {
    mount(`
      <div aria-hidden="true"><input id="ah" data-geek-slash-focus="50"></div>
      <div inert><input id="inert" data-geek-slash-focus="40"></div>
      <input id="ok" data-geek-slash-focus="10">
    `);
    pressSlash();
    expect(document.activeElement).toBe($('#ok'));
  });

  it('an open dialog with a marked input wins over the background', () => {
    // MUI's Modal aria-hides the app root while a dialog is open.
    mount(`
      <div id="root" aria-hidden="true"><input id="page" data-geek-slash-focus="50"></div>
      <div role="presentation"><div role="dialog"><input id="dlg" data-geek-slash-focus></div></div>
    `);
    pressSlash();
    expect(document.activeElement).toBe($('#dlg'));
  });

  it('an open dialog without a marked input: nothing happens', () => {
    mount(`
      <div id="root" aria-hidden="true"><input id="page" data-geek-slash-focus="50"></div>
      <div role="presentation"><div role="dialog"><button id="ok">OK</button></div></div>
    `);
    const event = pressSlash();
    expect(document.activeElement).toBe(document.body);
    expect(event.defaultPrevented).toBe(false);
  });

  it('no candidates: no-op, "/" is left alone', () => {
    mount('<input id="plain">');
    const event = pressSlash();
    expect(document.activeElement).toBe(document.body);
    expect(event.defaultPrevented).toBe(false);
  });

  it('resolves a marked wrapper to its first visible input', () => {
    mount(`
      <div id="wrap" data-geek-slash-focus>
        <form style="display:none"><input id="desktop"></form>
        <input id="mobile">
      </div>
    `);
    pressSlash();
    expect(document.activeElement).toBe($('#mobile'));
  });

  it('selects existing text in search boxes', () => {
    mount('<input id="q" data-geek-slash-focus value="zelda">');
    pressSlash();
    const q = $('#q');
    expect([q.selectionStart, q.selectionEnd]).toEqual([0, 5]);
  });

  it('does not select text when data-geek-slash-select="false"', () => {
    mount('<textarea id="c" data-geek-slash-focus="30" data-geek-slash-select="false">draft</textarea>');
    const c = $('#c');
    c.setSelectionRange(5, 5);
    pressSlash();
    expect(document.activeElement).toBe(c);
    expect(c.selectionStart).toBe(c.selectionEnd);
  });

  it('install is ref-counted: two installs, one listener, both must uninstall', () => {
    const second = installSlashFocus(document);
    mount('<input id="q" data-geek-slash-focus>');
    second();
    pressSlash();
    expect(document.activeElement).toBe($('#q'));
    uninstall();
    uninstall = null;
    $('#q').blur();
    pressSlash();
    expect(document.activeElement).toBe(document.body);
  });

  it('slashFocusProps builds the attributes', () => {
    expect(slashFocusProps()).toEqual({ 'data-geek-slash-focus': '10' });
    expect(slashFocusProps(30, { select: false })).toEqual({
      'data-geek-slash-focus': '30',
      'data-geek-slash-select': 'false',
    });
    expect(slashFocusProps(false)).toEqual({});
  });

  it('findSlashFocusTarget returns null with no document content', () => {
    mount('');
    expect(findSlashFocusTarget(document)).toBeNull();
  });
});

describe('slash focus in the React primitives', () => {
  let host;
  let root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('GeekShell installs the listener; GeekTopBar search slot is a candidate', () => {
    act(() => {
      root.render(
        <GeekShell topBar={<GeekTopBar title="T" search={<input id="top" />} />}>
          <button id="b">x</button>
        </GeekShell>
      );
    });
    pressSlash($('#b'));
    expect(document.activeElement).toBe($('#top'));
  });

  it('a page box at higher priority beats the GeekSearchField default', () => {
    act(() => {
      root.render(
        <SlashFocusProvider>
          <GeekSearchField placeholder="Search" />
          <textarea id="capture" {...slashFocusProps(30, { select: false })} />
        </SlashFocusProvider>
      );
    });
    pressSlash();
    expect(document.activeElement).toBe($('#capture'));
  });

  it('GeekSearchField marks itself and focuses on "/"', () => {
    act(() => {
      root.render(
        <SlashFocusProvider>
          <GeekSearchField placeholder="Search things" />
        </SlashFocusProvider>
      );
    });
    pressSlash();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search things');
  });

  it('GeekShell slashFocus={false} installs nothing', () => {
    act(() => {
      root.render(
        <GeekShell slashFocus={false}>
          <input id="q" data-geek-slash-focus />
        </GeekShell>
      );
    });
    pressSlash();
    expect(document.activeElement).toBe(document.body);
  });
});

/** Client-renders `node` into a detached host and returns its markup. */
function clientMarkup(node) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(node));
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
}

describe('the "/" keycap hint', () => {
  it('GeekSlashHint is aria-hidden and desktop-only', () => {
    const markup = clientMarkup(<GeekSlashHint />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('<kbd');
  });

  it('GeekSearchField shows the hint when empty and yields to an endAdornment', () => {
    const empty = clientMarkup(<GeekSearchField InputProps={{ endAdornment: null }} />);
    expect(empty).toContain('data-geek-slash-hint');
    const withClear = clientMarkup(
      <GeekSearchField InputProps={{ endAdornment: <button type="button">clear</button> }} />
    );
    expect(withClear).not.toContain('data-geek-slash-hint');
    const optedOut = clientMarkup(<GeekSearchField slashFocus={false} />);
    expect(optedOut).not.toContain('data-geek-slash-hint');
    expect(optedOut).not.toContain('data-geek-slash-focus');
  });
});
