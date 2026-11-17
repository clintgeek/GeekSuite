import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachPenKey, isPenKey } from '../../utils/penKey';

function fakeEditor(tool = 'draw', { readonly = false, editing = null } = {}) {
  const e = {
    tool,
    getCurrentToolId: () => e.tool,
    setCurrentTool: vi.fn((t) => { e.tool = t; }),
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

  it('switches pen to eraser, and back on the next one', () => {
    const editor = fakeEditor('draw');
    let t = 1000;
    detach = attachPenKey(window, () => editor, { now: () => t });
    const ev = press();
    expect(editor.setCurrentTool).toHaveBeenLastCalledWith('eraser');
    expect(ev.defaultPrevented).toBe(true);
    t += 1000;
    press();
    expect(editor.setCurrentTool).toHaveBeenLastCalledWith('draw');
  });

  it('from any other tool (the hand a saved sketch opens on) it goes to the eraser', () => {
    const editor = fakeEditor('hand');
    detach = attachPenKey(window, () => editor);
    press();
    expect(editor.tool).toBe('eraser');
  });

  it('ignores a second keydown within a quarter second', () => {
    const editor = fakeEditor('draw');
    let t = 1000;
    detach = attachPenKey(window, () => editor, { now: () => t });
    press();
    t += 100;
    press();
    expect(editor.setCurrentTool).toHaveBeenCalledTimes(1);
  });

  it('ignores the on-screen keyboard: keyCode 229, composing, a repeat', () => {
    const editor = fakeEditor('draw');
    detach = attachPenKey(window, () => editor);
    press({ keyCode: 229 });
    press({ isComposing: true });
    press({ repeat: true });
    expect(editor.setCurrentTool).not.toHaveBeenCalled();
  });

  it('ignores it while a text field has the focus', () => {
    const editor = fakeEditor('draw');
    detach = attachPenKey(window, () => editor);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press();
    expect(editor.setCurrentTool).not.toHaveBeenCalled();
  });

  it('ignores it while tldraw edits a text shape, and on a read-only sketch', () => {
    const editing = fakeEditor('draw', { editing: 'shape:1' });
    detach = attachPenKey(window, () => editing);
    press();
    expect(editing.setCurrentTool).not.toHaveBeenCalled();
    detach();
    const ro = fakeEditor('draw', { readonly: true });
    detach = attachPenKey(window, () => ro);
    press();
    expect(ro.setCurrentTool).not.toHaveBeenCalled();
  });

  it('ignores every named key', () => {
    expect(isPenKey({ key: 'e' })).toBe(false);
    expect(isPenKey({ key: 'Enter' })).toBe(false);
    expect(isPenKey({ key: 'Unidentified', ctrlKey: true })).toBe(false);
  });

  it('stops listening when detached', () => {
    const editor = fakeEditor('draw');
    attachPenKey(window, () => editor)();
    press();
    expect(editor.setCurrentTool).not.toHaveBeenCalled();
  });
});
