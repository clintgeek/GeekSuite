import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatNextSheet, { WhatNextButton } from '../../components/WhatNextSheet';
import { BOOKS } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const pick = (book, why) => ({ bookId: book.id, book, why });

const MODEL = { source: 'model', reason: null, model: 'llama-3.1-8b', provider: 'groq', cached: false, callsToday: 1, cap: 20 };
const FALLBACK = { source: 'fallback', reason: 'unavailable', model: null, provider: null, cached: false, callsToday: 1, cap: 20 };
const CAPPED = { ...FALLBACK, reason: 'cap' };

function props(over = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    picks: [pick(BOOKS[0], 'You rated John Scalzi 4 on average.')],
    provenance: MODEL,
    onOpen: vi.fn(),
    onStartReading: vi.fn(),
    ...over,
  };
}

describe('WhatNextSheet', () => {
  it('renders one row per pick, each with its whole reason', () => {
    renderWithProviders(
      <WhatNextSheet
        {...props({
          picks: [
            pick(BOOKS[0], 'You rated John Scalzi 4 on average.'),
            pick(BOOKS[1], 'Short enough for a weeknight.'),
          ],
        })}
      />
    );
    expect(screen.getByText('What should I read next?')).toBeInTheDocument();
    expect(screen.getAllByTestId('what-next-pick')).toHaveLength(2);
    expect(screen.getByText('You rated John Scalzi 4 on average.')).toBeInTheDocument();
    expect(screen.getByText('Short enough for a weeknight.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start reading' })).toHaveLength(2);
  });

  it('renders nothing while closed — the library page carries no rail', () => {
    renderWithProviders(<WhatNextSheet {...props({ open: false })} />);
    expect(screen.queryByText('What should I read next?')).not.toBeInTheDocument();
    expect(screen.queryByTestId('what-next-pick')).not.toBeInTheDocument();
  });

  it('always says it is AI-drafted, and names the model that drafted it', () => {
    renderWithProviders(<WhatNextSheet {...props()} />);
    expect(screen.getByText('AI-drafted by llama-3.1-8b')).toBeInTheDocument();
  });

  it('a deterministic result says so rather than borrowing the model\'s credit', () => {
    const { unmount } = renderWithProviders(<WhatNextSheet {...props({ provenance: FALLBACK })} />);
    expect(screen.getByText('No model — ranked from your own ratings')).toBeInTheDocument();
    unmount();
    renderWithProviders(<WhatNextSheet {...props({ provenance: CAPPED })} />);
    expect(screen.getByText('Daily AI limit reached — ranked from your own ratings')).toBeInTheDocument();
  });

  it('"Start reading" hands the whole book back — the sheet itself writes nothing', async () => {
    const onStartReading = vi.fn();
    renderWithProviders(<WhatNextSheet {...props({ onStartReading })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    expect(onStartReading).toHaveBeenCalledWith(BOOKS[0]);
  });

  it('opening a row is the same action as opening it in the grid', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<WhatNextSheet {...props({ onOpen })} />);
    await userEvent.click(screen.getByRole('button', { name: BOOKS[0].title }));
    expect(onOpen).toHaveBeenCalledWith(BOOKS[0]);
  });

  it('the mood box submits its text, and shows the mood behind the current list', async () => {
    const onSubmitMood = vi.fn();
    renderWithProviders(<WhatNextSheet {...props({ onSubmitMood, mood: 'funny' })} />);
    const box = screen.getByRole('textbox', { name: 'Mood for suggestions' });
    expect(box).toHaveValue('funny');
    await userEvent.clear(box);
    await userEvent.type(box, 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(onSubmitMood).toHaveBeenCalledWith('short');
  });

  it('shows skeletons while loading and an inline error', () => {
    const { unmount } = renderWithProviders(<WhatNextSheet {...props({ picks: [], loading: true })} />);
    expect(screen.getByLabelText('Finding suggestions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start reading' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<WhatNextSheet {...props({ picks: [], error: 'aiGeek did not answer.' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('aiGeek did not answer.');
  });

  it('says so when there is nothing to suggest', () => {
    renderWithProviders(<WhatNextSheet {...props({ picks: [] })} />);
    expect(screen.getByText(/Nothing to suggest right now/)).toBeInTheDocument();
  });
});

describe('WhatNextButton', () => {
  it('is a named 44px control in both layouts', async () => {
    const onClick = vi.fn();
    const { unmount } = renderWithProviders(<WhatNextButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'What should I read next?' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
    renderWithProviders(<WhatNextButton onClick={onClick} isDesktop />);
    await userEvent.click(screen.getByRole('button', { name: 'What next?' }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
