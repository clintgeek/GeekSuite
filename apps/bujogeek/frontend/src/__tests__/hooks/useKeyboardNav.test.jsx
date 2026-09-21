/**
 * Keyboard focus follows the TASK, not the row position.
 *
 * DOCS/BUJOGEEK_REVIEW_2026-09.md §4.3 — filed under UX, but it is a
 * correctness bug: focus was an array index, re-clamped only when the list's
 * LENGTH changed. The list is re-sorted whenever a task is edited (priority
 * and due date both move a row, per SORTING_RULES.md), so a same-length
 * reorder left the index pointing at a DIFFERENT task and the next keystroke
 * acted on it. Completing or deleting the wrong row.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import useKeyboardNav from '../../hooks/useKeyboardNav';

const task = (id, content) => ({ id, content, status: 'pending' });

let api;
function Probe({ tasks, ...callbacks }) {
  api = useKeyboardNav({ tasks, ...callbacks });
  return null;
}

// Dispatched on document.body, not window: the handler inspects
// `e.target.closest(...)` to avoid intercepting inside dialogs, and `window`
// has no `closest`. A real keystroke always targets an element.
const press = (key) => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('focus survives a re-sort', () => {
  beforeEach(() => { api = null; });

  it('stays on the same task when the list reorders around it', () => {
    // THE BUG. Focus lands on "beta" (index 1); an edit re-sorts the list so
    // "beta" is now index 0. Same length, so the old code kept index 1 —
    // which is now "alpha".
    const before = [task('a', 'alpha'), task('b', 'beta'), task('c', 'gamma')];
    const { rerender } = render(<Probe tasks={before} />);

    press('j');
    press('j');
    expect(api.focusedTaskId).toBe('b');

    const reordered = [task('b', 'beta'), task('a', 'alpha'), task('c', 'gamma')];
    rerender(<Probe tasks={reordered} />);

    expect(api.focusedTaskId).toBe('b');
  });

  it('acts on the task it is showing, after a reorder', () => {
    const onToggle = vi.fn();
    const before = [task('a', 'alpha'), task('b', 'beta')];
    const { rerender } = render(<Probe tasks={before} onToggle={onToggle} />);

    press('j');
    press('j');
    expect(api.focusedTaskId).toBe('b');

    rerender(<Probe tasks={[task('b', 'beta'), task('a', 'alpha')]} onToggle={onToggle} />);
    press('x');

    // Under the old index-based focus this toggled 'a'.
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0][0].id).toBe('b');
  });
});

describe('the behaviour that already worked, kept', () => {
  beforeEach(() => { api = null; });

  it('j moves down and k moves back up', () => {
    render(<Probe tasks={[task('a'), task('b'), task('c')]} />);
    press('j');
    expect(api.focusedTaskId).toBe('a');
    press('j');
    expect(api.focusedTaskId).toBe('b');
    press('k');
    expect(api.focusedTaskId).toBe('a');
  });

  it('stops at both ends rather than wrapping', () => {
    render(<Probe tasks={[task('a'), task('b')]} />);
    press('j'); press('j'); press('j'); press('j');
    expect(api.focusedTaskId).toBe('b');
    press('k'); press('k'); press('k');
    expect(api.focusedTaskId).toBe('a');
  });

  it('Escape clears focus', () => {
    render(<Probe tasks={[task('a')]} />);
    press('j');
    expect(api.focusedTaskId).toBe('a');
    press('Escape');
    expect(api.focusedTaskId).toBeNull();
  });

  it('hands focus to whatever replaced a task that left the list', () => {
    // Completing a task out of a filtered view should not drop focus — the
    // old index-clamping did this by accident and it is worth keeping.
    const before = [task('a'), task('b'), task('c')];
    const { rerender } = render(<Probe tasks={before} />);
    press('j'); press('j');
    expect(api.focusedTaskId).toBe('b');

    rerender(<Probe tasks={[task('a'), task('c')]} />);
    expect(api.focusedTaskId).toBe('c');
  });

  it('clears focus when the list empties', () => {
    const { rerender } = render(<Probe tasks={[task('a')]} />);
    press('j');
    rerender(<Probe tasks={[]} />);
    expect(api.focusedTaskId).toBeNull();
  });

  it('falls back to the last row when the list shrinks past the focus', () => {
    const { rerender } = render(<Probe tasks={[task('a'), task('b'), task('c')]} />);
    press('j'); press('j'); press('j');
    expect(api.focusedTaskId).toBe('c');

    rerender(<Probe tasks={[task('a')]} />);
    expect(api.focusedTaskId).toBe('a');
  });

  it('does not intercept while typing in an input', () => {
    const onToggle = vi.fn();
    render(<Probe tasks={[task('a')]} onToggle={onToggle} />);
    press('j');

    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    });

    expect(onToggle).not.toHaveBeenCalled();
    input.remove();
  });
});
