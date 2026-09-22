/**
 * The list view's row: scan and rate many books in one pass.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookRow from '../../components/BookRow';
import { BOOKS, SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const [reading42, read100, wantToRead0] = BOOKS;

describe('BookRow', () => {
  it('shows the title, author and shelf', () => {
    renderWithProviders(<BookRow book={read100} shelves={SHELVES} />);
    expect(screen.getByText('The Sound of Gravel')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('opens the book from the row', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<BookRow book={read100} shelves={SHELVES} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'The Sound of Gravel' }));
    expect(onOpen).toHaveBeenCalledWith(read100);
  });

  it('rates from the row without opening the book', async () => {
    const onRate = vi.fn();
    const onOpen = vi.fn();
    renderWithProviders(<BookRow book={read100} shelves={SHELVES} onRate={onRate} onOpen={onOpen} />);
    screen.getByRole('slider').focus();
    await userEvent.keyboard('2');
    expect(onRate).toHaveBeenCalledWith(read100, 2);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('slider').closest('button')).toBeNull();
  });

  it('follows the same rule as the cover for which books get stars', () => {
    const { rerender } = renderWithProviders(<BookRow book={wantToRead0} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    rerender(<BookRow book={reading42} shelves={SHELVES} onRate={vi.fn()} />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('selects instead of opening in select mode', async () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    renderWithProviders(
      <BookRow book={read100} shelves={SHELVES} selectMode onToggleSelect={onToggleSelect} onOpen={onOpen} onRate={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'The Sound of Gravel' }));
    expect(onToggleSelect).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
