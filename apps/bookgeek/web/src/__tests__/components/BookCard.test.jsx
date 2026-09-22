import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookCard from '../../components/BookCard';
import { BOOKS, SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const [reading42, read100, wantToRead0] = BOOKS; // Lock In, The Sound of Gravel, The Road to Jonestown

describe('BookCard', () => {
  it('renders the title, author and shelf status row', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    expect(screen.getByText('Lock In')).toBeInTheDocument();
    expect(screen.getByText('John Scalzi')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('falls back to "Untitled" / "Unknown author" for a bare book', () => {
    renderWithProviders(<BookCard book={{ id: 'x', shelf: 'all' }} shelves={SHELVES} />);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(screen.getByText('Unknown author')).toBeInTheDocument();
  });

  it('shows the progress percentage only while 0 < progress < 100', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('never shows a "100%" caption for a finished book', () => {
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} />);
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('renders the cover progress fill for any nonzero progress, including 100%', () => {
    const { rerender } = renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    expect(screen.getByTestId('book-card-progress')).toBeInTheDocument();
    rerender(<BookCard book={read100} shelves={SHELVES} />);
    expect(screen.getByTestId('book-card-progress')).toBeInTheDocument();
  });

  it('omits the cover progress fill entirely at 0%', () => {
    renderWithProviders(<BookCard book={wantToRead0} shelves={SHELVES} />);
    expect(screen.queryByTestId('book-card-progress')).not.toBeInTheDocument();
  });

  it('shows an "Owned" tick only for owned books', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    expect(screen.getByTitle('Owned')).toBeInTheDocument();
  });

  it('shows no owned tick for an unowned book', () => {
    renderWithProviders(<BookCard book={wantToRead0} shelves={SHELVES} />);
    expect(screen.queryByTitle('Owned')).not.toBeInTheDocument();
  });

  it('opens the book on click outside select mode', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    renderWithProviders(
      <BookCard book={reading42} shelves={SHELVES} onOpen={onOpen} onToggleSelect={onToggleSelect} />
    );
    await user.click(screen.getByRole('button', { name: 'Lock In' }));
    expect(onOpen).toHaveBeenCalledWith(reading42);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('toggles selection instead of opening while in select mode', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    renderWithProviders(
      <BookCard
        book={reading42}
        shelves={SHELVES}
        selectMode
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Lock In' }));
    expect(onToggleSelect).toHaveBeenCalledWith('b1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the checkbox in select mode also toggles selection without opening', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const { container } = renderWithProviders(
      <BookCard
        book={reading42}
        shelves={SHELVES}
        selectMode
        selected={false}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
      />
    );
    const checkbox = within(container).getByRole('checkbox', { name: 'Select Lock In' });
    await user.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith('b1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the whole card is a single button carrying the title as its aria-label', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    const button = screen.getByRole('button', { name: 'Lock In' });
    expect(button).toHaveAttribute('aria-label', 'Lock In');
  });

  it('reflects selected state via aria-pressed while in select mode', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} selectMode selected />);
    expect(screen.getByRole('button', { name: 'Lock In' })).toHaveAttribute('aria-pressed', 'true');
  });
});

/**
 * Stars on the cover — rate a book without opening it.
 *
 * The strip sits BESIDE the card's button, never inside it, so a star tap must
 * never open the book.
 */
describe('BookCard — stars on the cover', () => {
  it('shows stars on a book you have read', () => {
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.getByRole('slider', { name: 'Rate The Sound of Gravel' })).toBeInTheDocument();
  });

  it('keeps showing a rating on a book that is off the Read shelf', () => {
    // reading42 is on "reading" but rated 4 — its stars stay visible.
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '4 of 5 stars');
  });

  it('shows no stars on an unrated book you have not read', () => {
    renderWithProviders(<BookCard book={wantToRead0} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('hides the stars in select mode, where a tap means "select"', () => {
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} onRate={vi.fn()} selectMode />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('rates without opening the book', async () => {
    const onRate = vi.fn();
    const onOpen = vi.fn();
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} onRate={onRate} onOpen={onOpen} />);
    const stars = screen.getByRole('slider');
    stars.focus();
    await userEvent.keyboard('3');
    expect(onRate).toHaveBeenCalledWith(read100, 3);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is not nested inside the card\'s button', () => {
    // A control inside a <button> is invalid HTML, and every star tap would
    // bubble into "open the book".
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.getByRole('slider').closest('button')).toBeNull();
  });
});
