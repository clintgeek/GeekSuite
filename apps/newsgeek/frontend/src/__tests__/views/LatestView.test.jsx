import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET_NEWS_ARTICLES } from '../../graphql/queries';
import LatestView from '../../views/LatestView';
import { article } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const page = (items, nextBefore = null) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextBefore } } });
const articlesMock = (variables, result) => ({ request: { query: GET_NEWS_ARTICLES, variables }, result });

describe('Latest', () => {
  it('lists articles newest first, linking out to the publisher, with OFFICIAL only on official items', async () => {
    const mocks = [
      articlesMock(
        { limit: 30 },
        page([
          article('a1', { title: 'Arkadelphia council meets Tuesday' }),
          article('a2', { title: 'Flood watch for Clark County', sourceKind: 'official', publisher: 'NWS Little Rock', sourceName: 'NWS alerts' }),
        ])
      ),
    ];
    renderWithProviders(<LatestView />, { mocks });

    const items = await screen.findAllByTestId('article');
    expect(items).toHaveLength(2);
    const link = within(items[0]).getByRole('link', { name: /Arkadelphia council meets Tuesday/ });
    expect(link).toHaveAttribute('href', 'https://arkadelphian.com/a1/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(items[0]).getByText('Clark County')).toBeInTheDocument();

    expect(within(items[0]).queryByTestId('official-badge')).toBeNull();
    expect(within(items[1]).getByTestId('official-badge')).toHaveTextContent(/official/i);
    expect(screen.getAllByTestId('official-badge')).toHaveLength(1);
  });

  it('"Older stories" asks for the next page with before = nextBefore and appends it', async () => {
    const cursor = '2026-10-09T08:00:00.000Z';
    const mocks = [
      articlesMock({ limit: 30 }, page([article('new1'), article('new2')], cursor)),
      articlesMock({ limit: 30, before: cursor }, page([article('old1', { title: 'Older headline' })], null)),
    ];
    renderWithProviders(<LatestView />, { mocks });

    await userEvent.click(await screen.findByRole('button', { name: 'Older stories' }));
    expect(await screen.findByRole('link', { name: /Older headline/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('article')).toHaveLength(3);
    // The end of the archive says so instead of offering another page.
    expect(screen.queryByRole('button', { name: 'Older stories' })).toBeNull();
    expect(screen.getByText(/That’s everything we’ve kept/)).toBeInTheDocument();
  });

  it('a section tab asks the gateway for that section', async () => {
    const mocks = [
      articlesMock({ limit: 30 }, page([article('any1', { title: 'Everything headline' })])),
      articlesMock({ limit: 30, section: 'tech' }, page([article('t1', { title: 'Tech headline', sections: ['tech'] })])),
    ];
    renderWithProviders(<LatestView />, { mocks });

    await screen.findByRole('link', { name: /Everything headline/ });
    await userEvent.click(screen.getByRole('tab', { name: 'Tech' }));
    expect(await screen.findByRole('link', { name: /Tech headline/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tech' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the section in the URL', async () => {
    const mocks = [articlesMock({ limit: 30, section: 'local' }, page([article('l1', { title: 'Local headline' })]))];
    renderWithProviders(<LatestView />, { mocks, initialEntries: ['/?section=local'] });
    expect(await screen.findByRole('link', { name: /Local headline/ })).toBeInTheDocument();
  });

  it('an empty paper says so honestly', async () => {
    renderWithProviders(<LatestView />, { mocks: [articlesMock({ limit: 30 }, page([]))] });
    expect(await screen.findByText(/No stories yet — the presses are warming up\. Sources are polled every 15–60 minutes\./)).toBeInTheDocument();
  });
});
