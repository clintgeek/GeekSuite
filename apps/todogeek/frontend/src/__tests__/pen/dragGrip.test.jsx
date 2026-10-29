/**
 * The reorder grip (PenRow, sortable): only the grip starts a drag. A mouse
 * drags at once; a finger must rest HOLD_MS first, and a finger that moves
 * before then is a scroll — no drag, ever. The row's own swipe never starts
 * under the grip, and pressing the row's words never drags.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';

const start = vi.fn();
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    useDragControls: () => ({ start, subscribe: () => () => {}, cancel: vi.fn(), stop: vi.fn() }),
  };
});

const { Reorder } = await import('framer-motion');
const { default: PenRow, HOLD_MS } = await import('../../components/pen/PenRow');

const TASK = { id: 't1', content: 'Buy milk', status: 'pending', tags: [], dueDate: null };

function mount(props = {}) {
  const spies = { onDone: vi.fn(), onTomorrow: vi.fn(), onPickDate: vi.fn(), onToggleExpand: vi.fn(), onMove: vi.fn() };
  render(
    <ThemeProvider theme={createTodoTheme('light')}>
      <Reorder.Group as="ul" axis="y" values={['t1']} onReorder={() => {}}>
        <PenRow task={TASK} now={new Date(2026, 9, 29)} sortable {...spies} {...props} />
      </Reorder.Group>
    </ThemeProvider>,
  );
  return { spies, grip: screen.queryByRole('button', { name: 'Move Buy milk' }) };
}

const pointer = (el, type, init) => fireEvent[type](el, { pointerId: 3, isPrimary: true, button: 0, clientX: 300, clientY: 100, ...init });

beforeEach(() => { start.mockClear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the grip', () => {
  it('is a 44px target', () => {
    const { grip } = mount();
    // jsdom has no layout; the size is in the sx, read off the computed style.
    const style = window.getComputedStyle(grip);
    expect(style.width).toBe('44px');
    expect(style.height).toBe('44px');
  });

  it('a mouse drags at once', () => {
    const { grip } = mount();
    pointer(grip, 'pointerDown', { pointerType: 'mouse' });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a finger drags only after resting HOLD_MS', () => {
    const { grip } = mount();
    pointer(grip, 'pointerDown', { pointerType: 'touch' });
    expect(start).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(HOLD_MS - 10); });
    expect(start).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(20); });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a finger that moves first is a scroll: no drag', () => {
    const { grip } = mount();
    pointer(grip, 'pointerDown', { pointerType: 'touch' });
    pointer(grip, 'pointerMove', { pointerType: 'touch', clientY: 120 });
    act(() => { vi.advanceTimersByTime(HOLD_MS * 3); });
    expect(start).not.toHaveBeenCalled();
  });

  it('a tap (lifted before HOLD_MS) does not drag', () => {
    const { grip } = mount();
    pointer(grip, 'pointerDown', { pointerType: 'touch' });
    pointer(grip, 'pointerUp', { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(HOLD_MS * 3); });
    expect(start).not.toHaveBeenCalled();
  });

  it('pressing the row’s words never drags, and still opens it', () => {
    const { spies } = mount();
    const words = screen.getByText('Buy milk').closest('button');
    pointer(words, 'pointerDown', { pointerType: 'mouse' });
    pointer(words, 'pointerDown', { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(HOLD_MS * 3); });
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(words);
    expect(spies.onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('clicking the grip does not open the row', () => {
    const { grip, spies } = mount();
    fireEvent.click(grip);
    expect(spies.onToggleExpand).not.toHaveBeenCalled();
  });

  it('↑ / ↓ on the grip move the task', () => {
    const { grip, spies } = mount();
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'ArrowUp', altKey: true });
    expect(spies.onMove.mock.calls.map((c) => c[1])).toEqual([1, -1]);
  });

  it('an open row has no grip', () => {
    expect(mount({ expanded: true }).grip).toBeNull();
  });

  it('a crossed (settling) row has no grip', () => {
    expect(mount({ crossed: true }).grip).toBeNull();
  });

  it('outside Today a row is an ordinary list item with no grip', () => {
    render(
      <ThemeProvider theme={createTodoTheme('light')}>
        <ul><PenRow task={{ ...TASK, id: 't2', content: 'Elsewhere' }} now={new Date(2026, 9, 29)} /></ul>
      </ThemeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Move Elsewhere' })).toBeNull();
  });
});
