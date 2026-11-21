import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachPenKey, isPenKey } from './penKey';

function fakeEditor(tool = 'draw', { readonly = false, editing = null } = {}) {
  const e = {
    tool,
    getCurrentToolId: () => e.tool,
    setCurrentTool: vi.fn((t) => { e.tool = t; }),
    undo: vi.fn(),
    complete: vi.fn(),
    getInstanceState: () => ({ isReadonly: readonly }),
    getEditingShapeId: () => editing,
  };
  return e;
}
const press = (init = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(ev);
  return ev;
};

describe('the pen button that arrives as a key (Lenovo double-click)', () => {
  let detach;
  afterEach(() => { detach?.(); document.body.innerHTML = ''; });

  it('undoes the last stroke, once per double-click, and leaves the tool alone', () => {
    const editor = fakeEditor('draw');
    let t = 1000;
    detach = attachPenKey(window, () => editor, { now: () => t });
    const ev = press();
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.complete).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    t += 1000;
    press();
    expect(editor.undo).toHaveBeenCalledTimes(2);
    expect(editor.setCurrentTool).not.toHaveBeenCalled();
  });

  it('ignores a second keydown within a quarter second', () => {
    const editor = fakeEditor('draw');
    let t = 1000;
    detach = attachPenKey(window, () => editor, { now: () => t });
    press();
    t += 100;
    press();
    expect(editor.undo).toHaveBeenCalledTimes(1);
  });

  it('ignores the on-screen keyboard: keyCode 229, composing, a repeat', () => {
    const editor = fakeEditor('draw');
    detach = attachPenKey(window, () => editor);
    press({ keyCode: 229 });
    press({ isComposing: true });
    press({ repeat: true });
    expect(editor.undo).not.toHaveBeenCalled();
  });

  it('ignores it while a text field has the focus', () => {
    const editor = fakeEditor('draw');
    detach = attachPenKey(window, () => editor);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press();
    expect(editor.undo).not.toHaveBeenCalled();
  });

  it('ignores it while tldraw edits a text shape, and on a read-only sketch', () => {
    const editing = fakeEditor('draw', { editing: 'shape:1' });
    detach = attachPenKey(window, () => editing);
    press();
    expect(editing.undo).not.toHaveBeenCalled();
    detach();
    const ro = fakeEditor('draw', { readonly: true });
    detach = attachPenKey(window, () => ro);
    press();
    expect(ro.undo).not.toHaveBeenCalled();
  });

  it('ignores every named key', () => {
    expect(isPenKey({ key: 'e' })).toBe(false);
    expect(isPenKey({ key: 'Enter' })).toBe(false);
    expect(isPenKey({ key: 'Unidentified', ctrlKey: true })).toBe(false);
    expect(isPenKey({ key: 'Unidentified', code: 'F13' })).toBe(false);
    expect(isPenKey({ key: 'Unidentified', code: '' })).toBe(true);
  });

  it('stops listening when detached', () => {
    const editor = fakeEditor('draw');
    attachPenKey(window, () => editor)();
    press();
    expect(editor.undo).not.toHaveBeenCalled();
  });
});
