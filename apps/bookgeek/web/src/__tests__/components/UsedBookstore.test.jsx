/**
 * Used Bookstore (2026-09-30): the book stands on a shelf, the unread pile
 * wears a price sticker, a book in progress or a five-star book gets a
 * hand-lettered talker, and an empty library is a bargain bin.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import BookCard from '../../components/BookCard';
import BargainBin from '../../components/BargainBin';
import { stickerFor } from '../../components/PriceSticker';
import { talkerFor } from '../../components/ShelfTalker';
import { BOOKS, SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const [reading42, read100] = BOOKS;

describe('price sticker', () => {
  it('every built-in shelf wears one, except Unread (most of the library)', () => {
    expect(stickerFor({ shelf: 'reading' })).toMatchObject({ tone: 'reading', lines: ['Reading'] });
    expect(stickerFor({ shelf: 'on-reader' })).toMatchObject({ tone: 'on-reader' });
    expect(stickerFor({ shelf: 'read' })).toMatchObject({ tone: 'read', lines: ['Read'] });
    expect(stickerFor({ shelf: 'want-to-read' })).toMatchObject({ tone: 'want-to-read' });
    expect(stickerFor({ shelf: 'abandoned' })).toMatchObject({ tone: 'abandoned', lines: ['Gave', 'up'] });
    for (const shelf of ['unread', 'custom-comfort-reads', undefined]) expect(stickerFor({ shelf })).toBeNull();
  });

  it('is decorative on the card: the shelf stays in the caption', () => {
    renderWithProviders(<BookCard book={{ ...read100, shelf: 'on-reader', rating: null }} shelves={SHELVES} />);
    expect(screen.getByTestId('price-sticker')).toHaveAttribute('aria-hidden', 'true');
  });

  it('an unread book carries no sticker', () => {
    renderWithProviders(<BookCard book={{ ...read100, shelf: 'unread', rating: null }} shelves={SHELVES} />);
    expect(screen.queryByTestId('price-sticker')).toBeNull();
  });

  it('a read book wears the Read sticker, drawn — it adds no text to the card', () => {
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} />);
    const sticker = screen.getByTestId('price-sticker');
    expect(sticker).toHaveAttribute('data-tone', 'read');
    expect(sticker.textContent).toBe('');
    expect(sticker.querySelector('[data-label]')).toHaveAttribute('data-label', 'Read');
  });
});

describe('shelf talker', () => {
  it('says something only for a book in progress or a five-star book', () => {
    expect(talkerFor({ readingProgress: 42 })).toBe('42% in — no spoilers!');
    expect(talkerFor({ readingProgress: 100, rating: 5 })).toBe('Staff pick!');
    expect(talkerFor({ readingProgress: 0, rating: 4 })).toBeNull();
    expect(talkerFor({ readingProgress: 100, rating: 3 })).toBeNull();
  });

  it('hangs on the card, decorative, while the caption keeps the number', () => {
    renderWithProviders(<BookCard book={reading42} shelves={SHELVES} />);
    expect(screen.getByTestId('shelf-talker')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});

describe('the shelf', () => {
  it('every card stands on a plank; the card is a book, not a boxed tile', () => {
    renderWithProviders(<BookCard book={read100} shelves={SHELVES} />);
    const card = screen.getByTestId('book-card');
    expect(within(card).getByTestId('shelf-plank')).toHaveAttribute('aria-hidden', 'true');
    expect(card.querySelector('.MuiCard-root')).toBeNull();
  });
});

describe('bargain bin', () => {
  it('the empty state is a crate with a sign, and the words are real text', () => {
    renderWithProviders(<BargainBin sign="Bargain bin's empty" title="No books here yet" description="Add a book to start your library." />);
    expect(screen.getByRole('heading', { name: 'No books here yet' })).toBeInTheDocument();
    expect(screen.getByText("Bargain bin's empty").closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
