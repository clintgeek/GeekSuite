import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatNextShelf from '../../components/WhatNextShelf';
import { BOOKS, SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const pick = (book, why) => ({ bookId: book.id, book, why });

const MODEL = { source: 'model', reason: null, model: 'llama-3.1-8b', provider: 'groq', cached: false, callsToday: 1, cap: 20 };
const FALLBACK = { source: 'fallback', reason: 'unavailable', model: null, provider: null, cached: false, callsToday: 1, cap: 20 };
const CAPPED = { ...FALLBACK, reason: 'cap' };

function props(over = {}) {
  return {
    picks: [pick(BOOKS[0], 'You rated John Scalzi 4 on average.')],
    provenance: MODEL,
    shelves: SHELVES,
    onOpen: vi.fn(),
    onStartReading: vi.fn(),
    ...over,
  };
}

describe('WhatNextShelf', () => {
  it('renders one card per pick, each with its own reason', () => {
    renderWithProviders(
      <WhatNextShelf
        {...props({
          picks: [
            pick(BOOKS[0], 'You rated John Scalzi 4 on average.'),
            pick(BOOKS[1], 'Short enough for a weeknight.'),
          ],
        })}
      />
    );
    expect(screen.getByRole('heading', { name: 'What next?' })).toBeInTheDocument();
    expect(screen.getByText('You rated John Scalzi 4 on average.')).toBeInTheDocument();
    expect(screen.getByText('Short enough for a weeknight.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start reading' })).toHaveLength(2);
  });

  it('always says it is AI-drafted, and names the model that drafted it', () => {
    renderWithProviders(<WhatNextShelf {...props()} />);
    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(screen.getByText('Drafted by llama-3.1-8b')).toBeInTheDocument();
  });

  it('a deterministic result says so rather than borrowing the model\'s credit', () => {
    renderWithProviders(<WhatNextShelf {...props({ provenance: FALLBACK })} />);
    expect(screen.getByText('No model — ranked from your own ratings')).toBeInTheDocument();
    renderWithProviders(<WhatNextShelf {...props({ provenance: CAPPED })} />);
    expect(screen.getByText('Daily AI limit reached — ranked from your own ratings')).toBeInTheDocument();
  });

  it('"Start reading" hands the whole book back — the shelf itself writes nothing', async () => {
    const onStartReading = vi.fn();
    renderWithProviders(<WhatNextShelf {...props({ onStartReading })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    expect(onStartReading).toHaveBeenCalledWith(BOOKS[0]);
  });

  it('opening a card is the same action as opening it in the grid', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<WhatNextShelf {...props({ onOpen })} />);
    await userEvent.click(screen.getByRole('button', { name: BOOKS[0].title }));
    expect(onOpen).toHaveBeenCalledWith(BOOKS[0]);
  });

  it('renders nothing at all when there is nothing to suggest', () => {
    const { container } = renderWithProviders(<WhatNextShelf {...props({ picks: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeletons while loading and an inline error that never replaces the library', () => {
    const { unmount } = renderWithProviders(<WhatNextShelf {...props({ picks: [], loading: true })} />);
    expect(screen.getByRole('heading', { name: 'What next?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start reading' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<WhatNextShelf {...props({ picks: [], error: 'aiGeek did not answer.' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('aiGeek did not answer.');
  });
});
