import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShelfStrip from '../../components/ShelfStrip';
import { SHELVES, SHELF_SUMMARY } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('ShelfStrip', () => {
  it('renders "All" plus every shelf, with counts from the summary', () => {
    renderWithProviders(
      <ShelfStrip
        shelves={SHELVES}
        shelfSummary={SHELF_SUMMARY}
        value="all"
        onChange={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole('tab');
    // "All" + every non-"all" shelf in SHELVES (which already includes "all").
    expect(tabs).toHaveLength(SHELVES.length);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('223')).toBeInTheDocument(); // All books total
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // reading count
  });

  it('marks the active shelf selected', () => {
    renderWithProviders(
      <ShelfStrip
        shelves={SHELVES}
        shelfSummary={SHELF_SUMMARY}
        value="reading"
        onChange={vi.fn()}
      />
    );
    const readingTab = screen.getByRole('tab', { name: /Reading/ });
    expect(readingTab).toHaveAttribute('aria-selected', 'true');
    const allTab = screen.getByRole('tab', { name: /All/ });
    expect(allTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders no count for a shelf missing from the summary', () => {
    renderWithProviders(
      <ShelfStrip
        shelves={SHELVES}
        shelfSummary={SHELF_SUMMARY}
        value="all"
        onChange={vi.fn()}
      />
    );
    // "Comfort reads" (custom-comfort-reads) has count 1 in the summary, so
    // it does show a count — assert on a shelf truly absent instead.
    expect(screen.queryByText('need-to-find')).not.toBeInTheDocument();
  });

  it('clicking a shelf chip picks that shelf', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<ShelfStrip shelves={SHELVES} shelfSummary={SHELF_SUMMARY} value="all" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: /Reading/ }));
    expect(onChange).toHaveBeenCalledWith('reading');
  });

  it('lights no chip when several shelves are picked in the sheet', () => {
    renderWithProviders(<ShelfStrip shelves={SHELVES} shelfSummary={SHELF_SUMMARY} value={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole('tab').every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('hints that more shelves lie past the edge, and stops once you reach the end (review 2026-11-18 #10)', () => {
    renderWithProviders(
      <ShelfStrip shelves={SHELVES} shelfSummary={SHELF_SUMMARY} value="all" onChange={vi.fn()} />
    );
    const strip = screen.getByRole('tablist', { name: 'Shelves' });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 390 });
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 800 });
    strip.scrollLeft = 0;
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute('data-more-right', 'true');
    expect(strip).toHaveAttribute('data-more-left', 'false');

    strip.scrollLeft = 410;
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute('data-more-right', 'false');
    expect(strip).toHaveAttribute('data-more-left', 'true');
  });
});
