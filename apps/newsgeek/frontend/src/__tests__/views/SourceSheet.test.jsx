/**
 * The Source sheet (plan "Source sheet", Chef 2026-10-10): the publisher line
 * on a story opens it; a direct source gets In my paper / I subscribe / More
 * from / Source details; an aggregator (Google News) item gets Hide this
 * publisher / I subscribe by domain / Look for a direct feed / More from the
 * aggregator. Latest filtered by `?source=`; Source detail's I subscribe;
 * Settings → Publishers.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { useLocation } from 'react-router-dom';
import { SET_NEWS_PUBLISHER_PREF, SET_NEWS_SOURCE_ON, SET_NEWS_SOURCE_SUBSCRIBED } from '../../graphql/mutations';
import { GET_NEWS_ARTICLES, GET_NEWS_PLACES, GET_NEWS_PREFS, GET_NEWS_PUBLISHER_PREFS, GET_NEWS_SOURCE, GET_NEWS_SOURCES } from '../../graphql/queries';
import { discoverSource } from '../../api/discover';
import ArticleItem from '../../components/ArticleItem';
import LatestView from '../../views/LatestView';
import SettingsView from '../../views/SettingsView';
import SourceDetailView from '../../views/SourceDetailView';
import { article, source, viewerMock, walledSource, newsPrefs } from '../fixtures';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/discover', async (importActual) => {
  const actual = await importActual();
  return { ...actual, discoverSource: vi.fn() };
});

const page = (items, nextBefore = null, hiddenPaywalled = 0) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextBefore, hiddenPaywalled } } });
const articlesMock = (variables, items, extra = {}) => ({ request: { query: GET_NEWS_ARTICLES, variables }, result: page(items), ...extra });
const prefsMock = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: [] } } }, maxUsageCount: 5 };
const pubPrefs = (subscribedDomains = [], mutedDomains = []) => ({ __typename: 'NewsPrefs', subscribedSourceIds: [], subscribedDomains, mutedDomains });
const pubPrefsMock = (sub = [], muted = []) => ({ request: { query: GET_NEWS_PUBLISHER_PREFS }, result: { data: { newsPrefs: pubPrefs(sub, muted) } }, maxUsageCount: 5 });
const sourceMock = (src, extra = {}) => ({ request: { query: GET_NEWS_SOURCE, variables: { id: src.id } }, result: { data: { newsSource: src } }, maxUsageCount: 5, ...extra });

const ARK = source('s1', { name: 'The Arkadelphian', articlesLast7d: 22 });
const DIRECT = article('d1', { title: 'Council meets Tuesday' });
const GNEWS = { id: 'g1', name: 'Google News: Malvern' };
const VIA = article('v1', {
  title: 'Magnolia sets a budget hearing',
  url: 'https://magnoliareporter.com/budget/',
  publisher: 'Magnolia Reporter',
  publisherDomain: 'magnoliareporter.com',
  viaAggregator: true,
  sourceId: GNEWS.id,
  sourceName: GNEWS.name,
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

function renderLatest(mocks, initialEntries = ['/everything']) {
  return renderWithProviders(
    <>
      <LatestView />
      <Where />
    </>,
    { mocks: [prefsMock, ...mocks], initialEntries }
  );
}

// The Source sheet opens from the story's ⋯ menu → "Source settings".
const openSheetFor = async (name) => {
  const story = (await screen.findAllByTestId('article')).find((a) => within(a).queryByText(name));
  await userEvent.click(within(story).getByRole('button', { name: /^More for/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Source settings' }));
  return screen.findByRole('dialog');
};

describe('Source settings lives in the ⋯ menu, not on the name', () => {
  it('the publisher name is plain text; "Source settings" in the menu opens the sheet; the headline still links to the publisher', async () => {
    const onOpenSource = vi.fn();
    renderWithProviders(<ArticleItem article={DIRECT} onOpenSource={onOpenSource} />);
    expect(screen.queryByRole('button', { name: /The Arkadelphian/ })).toBeNull();
    expect(screen.getByText('The Arkadelphian').closest('button')).toBeNull();
    const link = screen.getByRole('link', { name: /Council meets Tuesday/ });
    expect(link).toHaveAttribute('href', 'https://arkadelphian.com/d1/');
    expect(link).toHaveAttribute('target', '_blank');
    await userEvent.click(screen.getByRole('button', { name: /^More for/ }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items[0]).toBe('Open at publisher');
    expect(items[items.length - 1]).toBe('Source settings');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Source settings' }));
    expect(onOpenSource).toHaveBeenCalledWith(DIRECT);
  });

  it('without a handler the menu has no "Source settings"', async () => {
    renderWithProviders(<ArticleItem article={DIRECT} />);
    await userEvent.click(screen.getByRole('button', { name: /^More for/ }));
    expect(screen.queryByRole('menuitem', { name: 'Source settings' })).toBeNull();
  });
});

describe('Source sheet — a direct source', () => {
  it('opens from Latest with the name, badges, health and both switches', async () => {
    const walled = walledSource('s1', 'hard', { name: 'The Arkadelphian', articlesLast7d: 22, subscribedByMe: true });
    renderLatest([articlesMock({ limit: 30 }, [DIRECT]), sourceMock(walled)]);
    const sheet = await openSheetFor('The Arkadelphian');
    expect(sheet.querySelector('[data-geek-sheet="title"]')).toHaveTextContent(/^The Arkadelphian$/);
    expect(await within(sheet).findByTestId('source-sheet-direct')).toBeInTheDocument();
    expect(within(sheet).getByTestId('paywall-badge')).toHaveTextContent(/paywall/i);
    expect(within(sheet).getByTestId('source-sheet-health')).toHaveTextContent('OK');
    expect(within(sheet).getByTestId('source-sheet-health')).toHaveTextContent('22 stories this week');
    expect(within(sheet).getByRole('switch', { name: 'In my paper' })).toBeChecked();
    expect(within(sheet).getByRole('switch', { name: 'I subscribe' })).toBeChecked();
    expect(within(sheet).getByText('Keeps it when Free to read is on')).toBeInTheDocument();
    expect(within(sheet).queryByRole('switch', { name: 'Hide this publisher' })).toBeNull();
  });

  it('"In my paper" sends newsSetSourceOn(id, false), then refetches the list', async () => {
    const calls = [];
    renderLatest([
      articlesMock({ limit: 30 }, [DIRECT]),
      sourceMock(ARK),
      {
        request: { query: SET_NEWS_SOURCE_ON, variables: { id: 's1', on: false } },
        result: () => {
          calls.push('off');
          return { data: { newsSetSourceOn: { __typename: 'NewsSource', id: 's1', onForMe: false, defaultOn: true } } };
        },
      },
      articlesMock({ limit: 30 }, [], { result: () => { calls.push('refetch'); return page([]); } }),
    ]);
    const sheet = await openSheetFor('The Arkadelphian');
    const sw = await within(sheet).findByRole('switch', { name: 'In my paper' });
    await userEvent.click(sw);
    expect(sw).not.toBeChecked();
    await waitFor(() => expect(calls).toEqual(['off', 'refetch']));
  });

  it('"I subscribe" sends newsSetSourceSubscribed(id, true)', async () => {
    const calls = [];
    renderLatest([
      articlesMock({ limit: 30 }, [DIRECT], { maxUsageCount: 2 }),
      sourceMock(ARK),
      {
        request: { query: SET_NEWS_SOURCE_SUBSCRIBED, variables: { id: 's1', on: true } },
        result: () => {
          calls.push(true);
          return { data: { newsSetSourceSubscribed: { __typename: 'NewsSource', id: 's1', subscribedByMe: true } } };
        },
      },
    ]);
    const sheet = await openSheetFor('The Arkadelphian');
    const sw = await within(sheet).findByRole('switch', { name: 'I subscribe' });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    await waitFor(() => expect(calls).toEqual([true]));
  });

  it('a refused write snaps the switch back and says so', async () => {
    renderLatest([
      articlesMock({ limit: 30 }, [DIRECT]),
      sourceMock(ARK),
      { request: { query: SET_NEWS_SOURCE_SUBSCRIBED, variables: { id: 's1', on: true } }, result: { errors: [new GraphQLError('nope')] } },
    ]);
    const sheet = await openSheetFor('The Arkadelphian');
    const sw = await within(sheet).findByRole('switch', { name: 'I subscribe' });
    await userEvent.click(sw);
    expect(await screen.findByText('Couldn’t change your subscription. Try again.')).toBeInTheDocument();
    expect(sw).not.toBeChecked();
  });

  it('"Source details" goes to /sources/:id', async () => {
    renderLatest([articlesMock({ limit: 30 }, [DIRECT]), sourceMock(ARK)]);
    const sheet = await openSheetFor('The Arkadelphian');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Source details' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/sources/s1');
  });
});

describe('More from this source', () => {
  it('filters Latest to the source: URL, sourceId sent, "Showing" chip, flags put away; × brings everything back', async () => {
    const asked = [];
    renderLatest([
      articlesMock({ limit: 30 }, [DIRECT, VIA], { maxUsageCount: 2 }),
      sourceMock(ARK),
      articlesMock({ limit: 30, sourceId: 's1' }, [DIRECT], { result: () => { asked.push('s1'); return page([DIRECT]); } }),
    ]);
    const sheet = await openSheetFor('The Arkadelphian');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'More from this source' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/everything?source=s1');
    expect(await screen.findByTestId('source-filter')).toHaveTextContent('Showing: The Arkadelphian');
    await waitFor(() => expect(asked).toEqual(['s1']));
    await waitFor(() => expect(screen.getAllByTestId('article')).toHaveLength(1));
    // The sheet has closed (the page is no longer hidden behind it), and the
    // section flags are put away while the filter is on.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('tablist', { hidden: true })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show every source, not just The Arkadelphian' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/everything$/);
    expect(screen.queryByTestId('source-filter')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Tech' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('article')).toHaveLength(2));
  });

  it('a deep link opens filtered and names the source; an empty filtered list says whose', async () => {
    renderLatest([articlesMock({ limit: 30, sourceId: 's1' }, []), sourceMock(ARK)], ['/everything?source=s1']);
    expect(await screen.findByText('Nothing from The Arkadelphian in your paper right now.')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter')).toHaveTextContent('Showing: The Arkadelphian');
  });
});

describe('Source sheet — through an aggregator', () => {
  it('titles the publisher, with its domain and "via" the aggregator, and shows the domain switches', async () => {
    renderLatest([articlesMock({ limit: 30 }, [VIA]), pubPrefsMock([], ['other.example'])]);
    const sheet = await openSheetFor('Magnolia Reporter');
    expect(sheet.querySelector('[data-geek-sheet="title"]')).toHaveTextContent(/^Magnolia Reporter$/);
    expect(sheet).toHaveTextContent('magnoliareporter.com · via Google News: Malvern');
    expect(await within(sheet).findByRole('switch', { name: 'Hide this publisher' })).not.toBeChecked();
    expect(within(sheet).getByRole('switch', { name: 'I subscribe' })).not.toBeChecked();
    expect(within(sheet).queryByRole('switch', { name: 'In my paper' })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'More from Google News: Malvern' })).toBeInTheDocument();
  });

  it('"Hide this publisher" sends newsSetPublisherPref(domain, muted: true) and refetches', async () => {
    const calls = [];
    renderLatest([
      articlesMock({ limit: 30 }, [VIA]),
      pubPrefsMock(),
      {
        request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'magnoliareporter.com', muted: true } },
        result: () => {
          calls.push('muted');
          return { data: { newsSetPublisherPref: pubPrefs([], ['magnoliareporter.com']) } };
        },
      },
      articlesMock({ limit: 30 }, [], { result: () => { calls.push('refetch'); return page([]); } }),
    ]);
    const sheet = await openSheetFor('Magnolia Reporter');
    const sw = await within(sheet).findByRole('switch', { name: 'Hide this publisher' });
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    await waitFor(() => expect(calls).toEqual(['muted', 'refetch']));
  });

  it('"I subscribe" sends newsSetPublisherPref(domain, subscribed: true)', async () => {
    const calls = [];
    renderLatest([
      articlesMock({ limit: 30 }, [VIA], { maxUsageCount: 2 }),
      pubPrefsMock(),
      {
        request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'magnoliareporter.com', subscribed: true } },
        result: () => {
          calls.push('subscribed');
          return { data: { newsSetPublisherPref: pubPrefs(['magnoliareporter.com'], []) } };
        },
      },
    ]);
    const sheet = await openSheetFor('Magnolia Reporter');
    const sw = await within(sheet).findByRole('switch', { name: 'I subscribe' });
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    await waitFor(() => expect(calls).toEqual(['subscribed']));
  });

  it('a parent domain covers a subdomain, and turning it off removes the parent entry', async () => {
    const calls = [];
    const obit = { ...VIA, id: 'v2', publisher: 'NWA Obituaries', publisherDomain: 'obits.nwaonline.com' };
    renderLatest([
      articlesMock({ limit: 30 }, [obit], { maxUsageCount: 2 }),
      pubPrefsMock(['nwaonline.com']),
      {
        request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'nwaonline.com', subscribed: false } },
        result: () => {
          calls.push('nwaonline.com');
          return { data: { newsSetPublisherPref: pubPrefs([], []) } };
        },
      },
    ]);
    const sheet = await openSheetFor('NWA Obituaries');
    const sw = await within(sheet).findByRole('switch', { name: 'I subscribe' });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    await waitFor(() => expect(calls).toEqual(['nwaonline.com']));
    expect(sw).not.toBeChecked();
  });

  it('a refused write snaps back and shows the gateway’s message', async () => {
    renderLatest([
      articlesMock({ limit: 30 }, [VIA]),
      pubPrefsMock(),
      { request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'magnoliareporter.com', muted: true } }, result: { errors: [new GraphQLError('You can hide at most 200 publishers')] } },
    ]);
    const sheet = await openSheetFor('Magnolia Reporter');
    const sw = await within(sheet).findByRole('switch', { name: 'Hide this publisher' });
    await userEvent.click(sw);
    expect(await screen.findByText('You can hide at most 200 publishers')).toBeInTheDocument();
    expect(sw).not.toBeChecked();
  });

  it('"Look for a direct feed" opens Add a source on https://<domain> and looks at once', async () => {
    discoverSource.mockReset();
    discoverSource.mockResolvedValue({ ok: false, message: 'No feed found — this site only publishes web pages', feeds: [] });
    renderLatest([
      articlesMock({ limit: 30 }, [VIA]),
      pubPrefsMock(),
      viewerMock(false),
      { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [] } } },
    ]);
    const sheet = await openSheetFor('Magnolia Reporter');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Look for a direct feed' }));
    expect(await screen.findByRole('dialog', { name: /Add a source/ })).toBeInTheDocument();
    await waitFor(() => expect(discoverSource).toHaveBeenCalledWith('https://magnoliareporter.com/', expect.anything()));
    expect(await screen.findByTestId('add-nofeed')).toBeInTheDocument();
  });

  it('"More from <aggregator>" filters Latest to the aggregator source', async () => {
    renderLatest([
      articlesMock({ limit: 30 }, [VIA]),
      pubPrefsMock(),
      articlesMock({ limit: 30, sourceId: 'g1' }, [VIA]),
      sourceMock(source('g1', { name: GNEWS.name, kind: 'aggregator' })),
    ]);
    const sheet = await openSheetFor('Magnolia Reporter');
    await userEvent.click(within(sheet).getByRole('button', { name: 'More from Google News: Malvern' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/everything?source=g1');
    expect(await screen.findByTestId('source-filter')).toHaveTextContent('Showing: Google News: Malvern');
  });

  it('with no known domain: no domain switches, only More from', async () => {
    renderLatest([articlesMock({ limit: 30 }, [{ ...VIA, publisherDomain: null }])]);
    const sheet = await openSheetFor('Magnolia Reporter');
    expect(within(sheet).queryByRole('switch')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'More from Google News: Malvern' })).toBeInTheDocument();
  });
});

describe('Source detail: I subscribe', () => {
  it('every reader gets the switch; it sends newsSetSourceSubscribed', async () => {
    const calls = [];
    renderWithProviders(<SourceDetailView />, {
      path: '/sources/:id',
      initialEntries: ['/sources/s1'],
      mocks: [
        viewerMock(false),
        sourceMock(ARK),
        {
          request: { query: SET_NEWS_SOURCE_SUBSCRIBED, variables: { id: 's1', on: true } },
          result: () => {
            calls.push(true);
            return { data: { newsSetSourceSubscribed: { __typename: 'NewsSource', id: 's1', subscribedByMe: true } } };
          },
        },
      ],
    });
    const sw = await screen.findByRole('switch', { name: 'I subscribe' });
    expect(sw).not.toBeChecked();
    expect(screen.queryByTestId('source-actions')).toBeNull();
    await userEvent.click(sw);
    await waitFor(() => expect(calls).toEqual([true]));
    expect(sw).toBeChecked();
  });
});

describe('Settings → Publishers', () => {
  const sourcesMock = (list) => ({ request: { query: GET_NEWS_SOURCES, variables: {} }, result: { data: { newsSources: list } }, maxUsageCount: 3 });
  const settingsPrefs = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: [] } } } };

  it('lists subscribed sources (linked), subscribed publishers and hidden publishers', async () => {
    renderWithProviders(<SettingsView />, {
      mocks: [
        settingsPrefs,
        pubPrefsMock(['nwaonline.com'], ['legacy.com', 'weather.example']),
        sourcesMock([walledSource('s-mal', 'hard', { name: 'Malvern Daily Record', subscribedByMe: true }), source('s1', { name: 'Not subscribed' })]),
      ],
    });
    const subs = await screen.findByTestId('subscribed-sources');
    expect(within(subs).getByRole('link', { name: 'Malvern Daily Record' })).toHaveAttribute('href', '/sources/s-mal');
    expect(within(subs).queryByText('Not subscribed')).toBeNull();
    expect(within(await screen.findByTestId('subscribed-domains')).getAllByTestId('publisher-row').map((r) => r.firstChild.textContent)).toEqual(['nwaonline.com']);
    expect(within(screen.getByTestId('hidden-domains')).getAllByTestId('publisher-row').map((r) => r.firstChild.textContent)).toEqual(['legacy.com', 'weather.example']);
  });

  it('says so when there is nothing', async () => {
    renderWithProviders(<SettingsView />, { mocks: [settingsPrefs, pubPrefsMock(), sourcesMock([source('s1')])] });
    expect(await screen.findByTestId('subscribed-sources-empty')).toBeInTheDocument();
    expect(await screen.findByTestId('subscribed-domains-empty')).toHaveTextContent('None yet.');
    expect(screen.getByTestId('hidden-domains-empty')).toHaveTextContent('None hidden.');
  });

  it('Remove sends the right flag for the right list and the row goes', async () => {
    const calls = [];
    renderWithProviders(<SettingsView />, {
      mocks: [
        settingsPrefs,
        pubPrefsMock(['nwaonline.com'], ['legacy.com']),
        sourcesMock([]),
        {
          request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'legacy.com', muted: false } },
          result: () => {
            calls.push('unmute legacy.com');
            return { data: { newsSetPublisherPref: pubPrefs(['nwaonline.com'], []) } };
          },
        },
        {
          request: { query: SET_NEWS_PUBLISHER_PREF, variables: { domain: 'nwaonline.com', subscribed: false } },
          result: () => {
            calls.push('unsubscribe nwaonline.com');
            return { data: { newsSetPublisherPref: pubPrefs([], []) } };
          },
        },
      ],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Show legacy.com again' }));
    expect(await screen.findByTestId('hidden-domains-empty')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop subscribing to nwaonline.com' }));
    expect(await screen.findByTestId('subscribed-domains-empty')).toBeInTheDocument();
    expect(calls).toEqual(['unmute legacy.com', 'unsubscribe nwaonline.com']);
  });
});
