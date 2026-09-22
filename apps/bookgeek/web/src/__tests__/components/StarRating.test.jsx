/**
 * The star control: one 44px strip where the tap position picks the star.
 *
 * jsdom has no layout, so each test gives the strip a 200px-wide box and taps
 * at a chosen x — each star then owns 40px.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import StarRating from '../../components/StarRating';
import { renderWithProviders } from '../testUtils';

const WIDTH = 200;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: WIDTH, bottom: 44, width: WIDTH, height: 44, x: 0, y: 0, toJSON() {},
  });
});

const tapAt = (x) => fireEvent.click(screen.getByRole('slider'), { clientX: x });
const fills = () => screen.getAllByRole('slider')[0].querySelectorAll('[data-fill]');

describe('tapping', () => {
  it('picks the star under the finger', () => {
    const onChange = vi.fn();
    renderWithProviders(<StarRating value={null} onChange={onChange} label="Dune" />);
    tapAt(5);     // first fifth
    tapAt(125);   // fourth fifth
    tapAt(199);   // the very edge is still star 5
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([1, 4, 5]);
  });

  it('changes an existing rating', () => {
    const onChange = vi.fn();
    renderWithProviders(<StarRating value={2} onChange={onChange} label="Dune" />);
    tapAt(180);
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('tapping the rating it already has does nothing — a mis-tap never deletes', () => {
    const onChange = vi.fn();
    renderWithProviders(<StarRating value={3} onChange={onChange} label="Dune" />);
    tapAt(100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never lets the tap reach the card underneath', () => {
    const openBook = vi.fn();
    renderWithProviders(
      <div onClick={openBook} onPointerDown={openBook}>
        <StarRating value={null} onChange={vi.fn()} label="Dune" />
      </div>
    );
    fireEvent.pointerDown(screen.getByRole('slider'));
    tapAt(50);
    expect(openBook).not.toHaveBeenCalled();
  });
});

describe('the keyboard', () => {
  it('arrows step, Home and End jump, a digit sets', () => {
    const onChange = vi.fn();
    renderWithProviders(<StarRating value={3} onChange={onChange} label="Dune" />);
    const s = screen.getByRole('slider');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    fireEvent.keyDown(s, { key: 'Home' });
    fireEvent.keyDown(s, { key: 'End' });
    fireEvent.keyDown(s, { key: '4' });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, 2, 1, 5, 4]);
  });
});

describe('display', () => {
  it('draws a stored half star as a half, not rounded', () => {
    renderWithProviders(<StarRating value={3.5} onChange={vi.fn()} label="Dune" />);
    expect([...fills()].map((n) => n.dataset.fill)).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });

  it('reads sensibly to a screen reader', () => {
    const { rerender } = renderWithProviders(<StarRating value={4} onChange={vi.fn()} label="Dune" />);
    const s = screen.getByRole('slider', { name: 'Rate Dune' });
    expect(s).toHaveAttribute('aria-valuetext', '4 of 5 stars');
    rerender(<StarRating value={null} onChange={vi.fn()} label="Dune" />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Not rated');
  });

  it('previews under a mouse, and not after a touch', () => {
    renderWithProviders(<StarRating value={1} onChange={vi.fn()} label="Dune" />);
    const s = screen.getByRole('slider');
    fireEvent.pointerMove(s, { clientX: 150, pointerType: 'mouse' });
    expect([...fills()].filter((n) => n.dataset.fill === 'full')).toHaveLength(4);
    fireEvent.pointerLeave(s);
    fireEvent.pointerMove(s, { clientX: 150, pointerType: 'touch' });
    // A touch leaves no "hover" behind to outlive a save that fails.
    expect([...fills()].filter((n) => n.dataset.fill === 'full')).toHaveLength(1);
  });
});
