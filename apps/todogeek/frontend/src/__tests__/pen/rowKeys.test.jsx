/**
 * Desktop keys: x done, t tomorrow, d pick a date, e edit — and focus follows
 * the TASK, not the position, so a re-sort cannot aim the next key at the
 * wrong row (DOCS/TODOGEEK_REVIEW_2026-09 §4.3).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import useRowKeys from '../../hooks/useRowKeys';

const A = { id: 'a', content: 'A' };
const B = { id: 'b', content: 'B' };
const C = { id: 'c', content: 'C' };

function Harness({ tasks, spies, onFocus }) {
  const { focusedTaskId } = useRowKeys({ tasks, ...spies });
  onFocus(focusedTaskId);
  return null;
}

function setup(initial) {
  const spies = { onDone: vi.fn(), onTomorrow: vi.fn(), onPickDate: vi.fn(), onEdit: vi.fn() };
  let focused = null;
  const utils = render(<Harness tasks={initial} spies={spies} onFocus={(id) => { focused = id; }} />);
  const rerender = (tasks) => utils.rerender(<Harness tasks={tasks} spies={spies} onFocus={(id) => { focused = id; }} />);
  const key = (k, extra = {}) => act(() => { fireEvent.keyDown(window, { key: k, ...extra }); });
  return { spies, key, rerender, focused: () => focused };
}

describe('useRowKeys', () => {
  it('x, t, d and e act on the focused task', () => {
    const { spies, key } = setup([A, B, C]);
    key('j'); key('j');
    key('x'); expect(spies.onDone).toHaveBeenLastCalledWith(B);
    key('t'); expect(spies.onTomorrow).toHaveBeenLastCalledWith(B);
    key('d'); expect(spies.onPickDate).toHaveBeenLastCalledWith(B);
    key('e'); expect(spies.onEdit).toHaveBeenLastCalledWith(B);
  });

  it('keeps focus on the same task when the list re-sorts', () => {
    const { spies, key, rerender, focused } = setup([A, B, C]);
    key('j'); key('j');
    expect(focused()).toBe('b');
    // B's priority went up: it is first now. Position 2 is A.
    rerender([B, A, C]);
    expect(focused()).toBe('b');
    key('x');
    expect(spies.onDone).toHaveBeenLastCalledWith(B);
  });

  it('hands focus to the row that took the place of one that left', () => {
    const { key, rerender, focused } = setup([A, B, C]);
    key('j'); key('j');
    rerender([A, C]); // B was done and left for Done
    expect(focused()).toBe('c');
  });

  it('does nothing with no row focused, while typing, or on the second key of a g-chord', () => {
    const { spies, key } = setup([A, B]);
    key('x');
    expect(spies.onDone).not.toHaveBeenCalled();
    key('j');
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => { fireEvent.keyDown(input, { key: 't' }); });
    expect(spies.onTomorrow).not.toHaveBeenCalled();
    key('g'); key('t'); // "go to Today"
    expect(spies.onTomorrow).not.toHaveBeenCalled();
    key('t');
    expect(spies.onTomorrow).toHaveBeenCalledWith(A);
    input.remove();
  });
});
