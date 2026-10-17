/**
 * The library header's Export: one tap fetches every matching game and hands
 * the browser a CSV named for the filter, then says how many.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';

const query = vi.fn();
vi.mock('@apollo/client', async (importOriginal) => ({ ...(await importOriginal()), useApolloClient: () => ({ query }) }));

const { default: ExportGamesButton } = await import('../../components/ExportGamesButton');

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ data: { games: { games: [{ id: 'g1', title: 'Celeste', me: { shelf: 'backlog' } }, { id: 'g2', title: 'Hades', me: {} }], total: 2, pages: 1 } } });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('ExportGamesButton', () => {
  it('exports what the filter matches and says how many', async () => {
    const clicks = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() { clicks.push(this.download); };
    try {
      renderWithProviders(<ExportGamesButton variables={{ page: 1, limit: 48, sort: 'title', sortDir: 'asc', filter: { shelves: ['backlog'] } }} isDesktop />);
      fireEvent.click(screen.getByRole('button', { name: 'Export these games (CSV)' }));
      expect(await screen.findByText('Exported 2 games')).toBeInTheDocument();
      expect(query.mock.calls[0][0].variables).toMatchObject({ filter: { shelves: ['backlog'] }, limit: 100 });
      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^gamegeek-backlog-\d{4}-\d{2}-\d{2}\.csv$/);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });

  it('a failed fetch says so in plain words', async () => {
    query.mockRejectedValue(new Error('Request failed with status code 502'));
    renderWithProviders(<ExportGamesButton variables={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export these games (CSV)' }));
    expect(await screen.findByText('Couldn’t export. Try again.')).toBeInTheDocument();
    expect(screen.queryByText(/502/)).toBeNull();
  });
});
