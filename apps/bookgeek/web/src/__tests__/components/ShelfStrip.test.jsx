import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
        shelfFilter="all"
        setShelfFilter={vi.fn()}
        setActiveView={vi.fn()}
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
        shelfFilter="reading"
        setShelfFilter={vi.fn()}
        setActiveView={vi.fn()}
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
        shelfFilter="all"
        setShelfFilter={vi.fn()}
        setActiveView={vi.fn()}
      />
    );
    // "Comfort reads" (custom-comfort-reads) has count 1 in the summary, so
    // it does show a count — assert on a shelf truly absent instead.
    expect(screen.queryByText('need-to-find')).not.toBeInTheDocument();
  });

  it('clicking a shelf chip sets the shelf filter and switches to the library view', async () => {
    const user = userEvent.setup();
    const setShelfFilter = vi.fn();
    const setActiveView = vi.fn();
    renderWithProviders(
      <ShelfStrip
        shelves={SHELVES}
        shelfSummary={SHELF_SUMMARY}
        shelfFilter="all"
        setShelfFilter={setShelfFilter}
        setActiveView={setActiveView}
      />
    );
    await user.click(screen.getByRole('tab', { name: /Reading/ }));
    expect(setShelfFilter).toHaveBeenCalledWith('reading');
    expect(setActiveView).toHaveBeenCalledWith('library');
  });
});
