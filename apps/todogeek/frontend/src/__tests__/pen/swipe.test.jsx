/**
 * Phone gestures: swipe right = done, swipe left = tomorrow, long swipe left =
 * pick a date. Letting go short of a threshold does nothing; a vertical drag
 * is a scroll; a mouse drag is not a swipe.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import useSwipe, { swipeOutcome, SWIPE } from '../../hooks/useSwipe';

describe('swipeOutcome', () => {
  it('maps travel to an action', () => {
    expect(swipeOutcome(SWIPE.ACTION_PX, 360)).toBe('done');
    expect(swipeOutcome(SWIPE.ACTION_PX - 1, 360)).toBeNull();
    expect(swipeOutcome(-SWIPE.ACTION_PX, 360)).toBe('tomorrow');
    expect(swipeOutcome(-179, 360)).toBe('tomorrow');
    expect(swipeOutcome(-180, 360)).toBe('pick');
    // On a narrow row the long swipe never needs less than LONG_MIN_PX.
    expect(swipeOutcome(-SWIPE.LONG_MIN_PX + 1, 200)).toBe('tomorrow');
    expect(swipeOutcome(-SWIPE.LONG_MIN_PX, 200)).toBe('pick');
  });
});

function Row(props) {
  const { handlers, dx } = useSwipe(props);
  return <div data-testid="row" data-dx={dx} {...handlers} style={{ width: 360 }}><span>words</span></div>;
}

const drag = (el, dx, dy = 0, pointerType = 'touch') => {
  fireEvent.pointerDown(el, { pointerType, clientX: 200, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(el, { pointerType, clientX: 200 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 });
  fireEvent.pointerMove(el, { pointerType, clientX: 200 + dx, clientY: 100 + dy, pointerId: 1 });
  fireEvent.pointerUp(el, { pointerType, clientX: 200 + dx, clientY: 100 + dy, pointerId: 1 });
};

function setup() {
  const spies = { onDone: vi.fn(), onTomorrow: vi.fn(), onPick: vi.fn() };
  const { getByTestId } = render(<Row {...spies} />);
  return { spies, row: getByTestId('row') };
}

describe('useSwipe', () => {
  it('swipe right is done', () => {
    const { spies, row } = setup();
    drag(row, 120);
    expect(spies.onDone).toHaveBeenCalledTimes(1);
    expect(spies.onTomorrow).not.toHaveBeenCalled();
  });

  it('swipe left is tomorrow; a long one picks a date', () => {
    const { spies, row } = setup();
    drag(row, -100);
    expect(spies.onTomorrow).toHaveBeenCalledTimes(1);
    drag(row, -260);
    expect(spies.onPick).toHaveBeenCalledTimes(1);
    expect(spies.onTomorrow).toHaveBeenCalledTimes(1);
  });

  it('a short swipe, a vertical drag and a mouse drag do nothing', () => {
    const { spies, row } = setup();
    drag(row, 40);
    drag(row, 10, 140);
    drag(row, 200, 0, 'mouse');
    expect(spies.onDone).not.toHaveBeenCalled();
    expect(spies.onTomorrow).not.toHaveBeenCalled();
    expect(spies.onPick).not.toHaveBeenCalled();
  });

  it('swallows the click that follows a swipe, so it does not open the editor', () => {
    const onClick = vi.fn();
    const spies = { onDone: vi.fn() };
    const { getByTestId } = render(<div onClick={onClick}><Row {...spies} /></div>);
    const row = getByTestId('row');
    drag(row, 120);
    fireEvent.click(row.firstChild);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(row.firstChild);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
