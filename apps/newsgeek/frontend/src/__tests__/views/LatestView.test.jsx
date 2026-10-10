import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS } from '../../graphql/queries';
import { SET_NEWS_PREFS } from '../../graphql/mutations';
import LatestView from '../../views/LatestView';
import { article } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const page = (items, nextBefore = null, hiddenPaywalled = 0) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextBefore, hiddenPaywalled } } });
const articlesMock = (variables, result) => ({ request: { query: GET_NEWS_ARTICLES, variables }, result });
const prefsMock = (freeToReadOnly = false) => ({
  request: { query: GET_NEWS_PREFS },
  result: { data: { newsPrefs: { __typename: 'NewsPrefs', freeToReadOnly } } },
});
const setPrefsMock = (freeToReadOnly, onCall = () => {}) => ({
  request: { query: SET_NEWS_PREFS, variables: { input: { freeToReadOnly } } },
  result: () => {
    onCall(freeToReadOnly);
    return { data: { newsSetPrefs: { __typename: 'NewsPrefs', freeToReadOnly } } };
  },
});

describe('Latest', () => {
  it('lists articles newest first, linking out to the publisher, with OFFICIAL only on official items', async () => {
    const mocks = [
      prefsMock(),
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
      prefsMock(),
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
      prefsMock(),
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
    const mocks = [prefsMock(), articlesMock({ limit: 30, section: 'local' }, page([article('l1', { title: 'Local headline' })]))];
    renderWithProviders(<LatestView />, { mocks, initialEntries: ['/?section=local'] });
    expect(await screen.findByRole('link', { name: /Local headline/ })).toBeInTheDocument();
  });

  it('an empty paper says so honestly', async () => {
    renderWithProviders(<LatestView />, { mocks: [prefsMock(), articlesMock({ limit: 30 }, page([]))] });
    expect(await screen.findByText(/No stories yet — the presses are warming up\. Sources are polled every 15–60 minutes\./)).toBeInTheDocument();
  });
});

describe('Free to read', () => {
  it('reflects the stored pref: off by default, labelled, nothing hidden', async () => {
    renderWithProviders(<LatestView />, { mocks: [prefsMock(false), articlesMock({ limit: 30 }, page([article('a1')]))] });
    const sw = await screen.findByRole('switch', { name: 'Free to read' });
    await screen.findAllByTestId('article');
    expect(sw).not.toBeChecked();
    expect(screen.queryByTestId('hidden-paywalled')).toBeNull();
  });

  it('on: the switch is on and the hidden count shows, pluralised', async () => {
    renderWithProviders(<LatestView />, { mocks: [prefsMock(true), articlesMock({ limit: 30 }, page([article('a1')], null, 14))] });
    expect(await screen.findByTestId('hidden-paywalled')).toHaveTextContent(/^14 paywalled stories hidden$/);
    expect(screen.getByRole('switch', { name: 'Free to read' })).toBeChecked();
  });

  it('one hidden story is singular, and none hides the line', async () => {
    const { unmount } = renderWithProviders(<LatestView />, { mocks: [prefsMock(true), articlesMock({ limit: 30 }, page([article('a1')], null, 1))] });
    expect(await screen.findByTestId('hidden-paywalled')).toHaveTextContent(/^1 paywalled story hidden$/);
    unmount();
    renderWithProviders(<LatestView />, { mocks: [prefsMock(true), articlesMock({ limit: 30 }, page([article('a2')], null, 0))] });
    await screen.findAllByTestId('article');
    expect(screen.queryByTestId('hidden-paywalled')).toBeNull();
  });

  it('flipping it sends newsSetPrefs with the flipped value, then shows the free list', async () => {
    const calls = [];
    renderWithProviders(<LatestView />, {
      mocks: [
        prefsMock(false),
        articlesMock({ limit: 30 }, page([article('free1', { title: 'Free headline' }), article('wall1', { title: 'Walled headline' })])),
        setPrefsMock(true, (v) => calls.push(v)),
        articlesMock({ limit: 30 }, page([article('free1', { title: 'Free headline' })], null, 1)),
      ],
    });
    await screen.findByRole('link', { name: /Walled headline/ });
    await userEvent.click(screen.getByRole('switch', { name: 'Free to read' }));
    expect(screen.getByRole('switch', { name: 'Free to read' })).toBeChecked();
    expect(await screen.findByTestId('hidden-paywalled')).toHaveTextContent('1 paywalled story hidden');
    expect(calls).toEqual([true]);
    expect(screen.queryByRole('link', { name: /Walled headline/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Free headline/ })).toBeInTheDocument();
  });

  it('flipping it off sends false', async () => {
    const calls = [];
    renderWithProviders(<LatestView />, {
      mocks: [
        prefsMock(true),
        articlesMock({ limit: 30 }, page([article('free1')], null, 3)),
        setPrefsMock(false, (v) => calls.push(v)),
        articlesMock({ limit: 30 }, page([article('free1'), article('wall1', { title: 'Walled headline' })])),
      ],
    });
    await screen.findByTestId('hidden-paywalled');
    await userEvent.click(screen.getByRole('switch', { name: 'Free to read' }));
    expect(await screen.findByRole('link', { name: /Walled headline/ })).toBeInTheDocument();
    expect(calls).toEqual([false]);
    expect(screen.getByRole('switch', { name: 'Free to read' })).not.toBeChecked();
    expect(screen.queryByTestId('hidden-paywalled')).toBeNull();
  });

  it('a flip drops the other sections’ cached lists too: no paywalled story flashes from the old setting', async () => {
    renderWithProviders(<LatestView />, {
      mocks: [
        prefsMock(false),
        articlesMock({ limit: 30 }, page([article('a1', { title: 'All headline' })])),
        articlesMock({ limit: 30, section: 'tech' }, page([article('t1', { title: 'Walled tech headline', sections: ['tech'] })])),
        articlesMock({ limit: 30 }, page([article('a1', { title: 'All headline' })])),
        setPrefsMock(true),
        articlesMock({ limit: 30 }, page([article('a1', { title: 'All headline' })], null, 2)),
        // Slow, so a stale cached list would be on screen while it's in flight.
        { ...articlesMock({ limit: 30, section: 'tech' }, page([article('t2', { title: 'Free tech headline', sections: ['tech'] })], null, 1)), delay: 300 },
      ],
    });
    await screen.findByRole('link', { name: /All headline/ });
    await userEvent.click(screen.getByRole('tab', { name: 'Tech' }));
    await screen.findByRole('link', { name: /Walled tech headline/ });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    await screen.findByRole('link', { name: /All headline/ });
    await userEvent.click(screen.getByRole('switch', { name: 'Free to read' }));
    await screen.findByText('2 paywalled stories hidden');
    await userEvent.click(screen.getByRole('tab', { name: 'Tech' }));
    expect(screen.queryByRole('link', { name: /Walled tech headline/ })).toBeNull();
    expect(await screen.findByRole('link', { name: /Free tech headline/ })).toBeInTheDocument();
  });
});
