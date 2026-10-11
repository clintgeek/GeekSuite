/**
 * "Open stories with" (plan "Opening", Chef 2026-10-11): the Source sheet's
 * per-publisher opener — by source for a direct source, by domain ("for
 * <domain>") for a story through Google News — and Settings → Publishers →
 * Open with, where each override can go back to the original. After a change
 * the visible headline for that publisher re-resolves at once.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { useLocation } from 'react-router-dom';
import { SET_NEWS_PUBLISHER_OPENER } from '../../graphql/mutations';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS, GET_NEWS_PUBLISHER_PREFS, GET_NEWS_SOURCE, GET_NEWS_SOURCES } from '../../graphql/queries';
import LatestView from '../../views/LatestView';
import SettingsView from '../../views/SettingsView';
import { article, newsPrefs, opener, readerLink, source } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const R1 = readerLink('aaa111', 'Reader one', 'https://example.com/read?u={url}');
const R2 = readerLink('bbb222', 'Reader two', 'https://example.org/go?to={url}');
const ARK = source('s1', { name: 'The Arkadelphian' });
const DIRECT = article('d1', { title: 'Council meets Tuesday', url: 'https://arkadelphian.com/d1/' });
const VIA = article('v1', {
  title: 'Budget passes',
  url: 'https://uk.reuters.com/budget/',
  publisher: 'Reuters',
  publisherDomain: 'uk.reuters.com',
  viaAggregator: true,
  sourceId: 'gnews',
  sourceName: 'Google News: Arkansas',
});

const page = (items) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextBefore: null, hiddenPaywalled: 0 } } });
const articlesMock = (items) => ({ request: { query: GET_NEWS_ARTICLES, variables: { limit: 30 } }, result: page(items), maxUsageCount: 3 });
const prefsMock = (over = {}) => ({ request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: newsPrefs(over) } }, maxUsageCount: 5 });
const pubPrefsMock = { request: { query: GET_NEWS_PUBLISHER_PREFS }, result: { data: { newsPrefs: { __typename: 'NewsPrefs', subscribedSourceIds: [], subscribedDomains: [], mutedDomains: [] } } }, maxUsageCount: 5 };
const sourceMock = { request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } }, result: { data: { newsSource: ARK } }, maxUsageCount: 5 };
const openerMock = (variables, result, calls) => ({
  request: { query: SET_NEWS_PUBLISHER_OPENER, variables },
  result: () => {
    calls?.push(variables);
    return result;
  },
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}</output>;
}

function renderLatest(mocks) {
  return renderWithProviders(
    <>
      <LatestView />
      <Where />
    </>,
    { mocks, initialEntries: ['/everything'] }
  );
}

const openSheetFor = async (title) => {
  const story = (await screen.findAllByTestId('article')).find((a) => within(a).queryByText(title));
  await userEvent.click(within(story).getByRole('button', { name: /^More for/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Source settings' }));
  return screen.findByRole('dialog');
};
// The story sits behind the open sheet (aria-hidden while the dialog is up).
const headline = (title) => screen.getByRole('link', { name: new RegExp(title), hidden: true });

describe('Source sheet — “Open stories with”, a direct source', () => {
  it('offers the original and each open-with link, with the original chosen', async () => {
    renderLatest([prefsMock({ readerLinks: [R1, R2] }), articlesMock([DIRECT]), sourceMock]);
    const sheet = await openSheetFor('Council meets Tuesday');
    const group = await within(sheet).findByRole('radiogroup', { name: 'Open stories with' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label').textContent)).toEqual(['Original link (publisher)', 'Reader one', 'Reader two']);
    expect(within(group).getByRole('radio', { name: 'Original link (publisher)' })).toBeChecked();
  });

  it('choosing a link sends newsSetPublisherOpener(sourceId, linkId), and the headline follows', async () => {
    const calls = [];
    renderLatest([
      prefsMock({ readerLinks: [R1, R2] }),
      articlesMock([DIRECT]),
      sourceMock,
      openerMock({ sourceId: 's1', linkId: 'bbb222' }, { data: { newsSetPublisherOpener: newsPrefs({ readerLinks: [R1, R2], openers: [opener({ sourceId: 's1', linkId: 'bbb222' })] }) } }, calls),
      openerMock({ sourceId: 's1', linkId: null }, { data: { newsSetPublisherOpener: newsPrefs({ readerLinks: [R1, R2] }) } }, calls),
    ]);
    expect(await screen.findByRole('link', { name: /Council meets Tuesday/ })).toHaveAttribute('href', 'https://arkadelphian.com/d1/');
    const sheet = await openSheetFor('Council meets Tuesday');
    await userEvent.click(await within(sheet).findByRole('radio', { name: 'Reader two' }));
    await waitFor(() => expect(calls).toEqual([{ sourceId: 's1', linkId: 'bbb222' }]));
    expect(within(sheet).getByRole('radio', { name: 'Reader two' })).toBeChecked();
    await waitFor(() => expect(headline('Council meets Tuesday')).toHaveAttribute('href', 'https://example.org/go?to=https%3A%2F%2Farkadelphian.com%2Fd1%2F'));

    // Back to the original: linkId null.
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Original link (publisher)' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ sourceId: 's1', linkId: null });
    await waitFor(() => expect(headline('Council meets Tuesday')).toHaveAttribute('href', 'https://arkadelphian.com/d1/'));
  });

  it('with no open-with links: disabled at the original, and a way to add some', async () => {
    renderLatest([prefsMock(), articlesMock([DIRECT]), sourceMock]);
    const sheet = await openSheetFor('Council meets Tuesday');
    const group = await within(sheet).findByRole('radiogroup', { name: 'Open stories with' });
    const original = within(group).getByRole('radio', { name: 'Original link (publisher)' });
    expect(original).toBeChecked();
    expect(original).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add open-with links in Settings' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'));
  });

  it('a refused write snaps back and shows the gateway’s message', async () => {
    renderLatest([
      prefsMock({ readerLinks: [R1] }),
      articlesMock([DIRECT]),
      sourceMock,
      { request: { query: SET_NEWS_PUBLISHER_OPENER, variables: { sourceId: 's1', linkId: 'aaa111' } }, result: { errors: [new GraphQLError('You can set an opener for at most 200 publishers')] } },
    ]);
    const sheet = await openSheetFor('Council meets Tuesday');
    await userEvent.click(await within(sheet).findByRole('radio', { name: 'Reader one' }));
    expect(await screen.findByText('You can set an opener for at most 200 publishers')).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: 'Original link (publisher)' })).toBeChecked());
    expect(headline('Council meets Tuesday')).toHaveAttribute('href', 'https://arkadelphian.com/d1/');
  });
});

describe('Source sheet — “Open stories with”, through an aggregator', () => {
  it('is keyed by the publisher’s domain and says “for <domain>”', async () => {
    const calls = [];
    renderLatest([
      prefsMock({ readerLinks: [R1] }),
      articlesMock([VIA]),
      pubPrefsMock,
      openerMock({ domain: 'uk.reuters.com', linkId: 'aaa111' }, { data: { newsSetPublisherOpener: newsPrefs({ readerLinks: [R1], openers: [opener({ domain: 'uk.reuters.com', linkId: 'aaa111' })] }) } }, calls),
    ]);
    const sheet = await openSheetFor('Budget passes');
    const group = await within(sheet).findByRole('radiogroup', { name: /Open stories with\s*for uk\.reuters\.com/ });
    await userEvent.click(within(group).getByRole('radio', { name: 'Reader one' }));
    await waitFor(() => expect(calls).toEqual([{ domain: 'uk.reuters.com', linkId: 'aaa111' }]));
    await waitFor(() => expect(headline('Budget passes')).toHaveAttribute('href', 'https://example.com/read?u=https%3A%2F%2Fuk.reuters.com%2Fbudget%2F'));
  });

  it('a parent domain’s opener covers a subdomain: shown chosen, and Original removes the parent entry', async () => {
    const calls = [];
    renderLatest([
      prefsMock({ readerLinks: [R1], openers: [opener({ domain: 'reuters.com', linkId: 'aaa111' })] }),
      articlesMock([VIA]),
      pubPrefsMock,
      openerMock({ domain: 'reuters.com', linkId: null }, { data: { newsSetPublisherOpener: newsPrefs({ readerLinks: [R1] }) } }, calls),
    ]);
    expect(await screen.findByRole('link', { name: /Budget passes/ })).toHaveAttribute('href', 'https://example.com/read?u=https%3A%2F%2Fuk.reuters.com%2Fbudget%2F');
    const sheet = await openSheetFor('Budget passes');
    const group = await within(sheet).findByRole('radiogroup', { name: /for reuters\.com/ });
    expect(within(group).getByRole('radio', { name: 'Reader one' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Original link (publisher)' }));
    await waitFor(() => expect(calls).toEqual([{ domain: 'reuters.com', linkId: null }]));
    await waitFor(() => expect(headline('Budget passes')).toHaveAttribute('href', 'https://uk.reuters.com/budget/'));
  });

  it('an aggregator item with no publisher domain has no opener control', async () => {
    renderLatest([prefsMock({ readerLinks: [R1] }), articlesMock([{ ...VIA, publisherDomain: null }])]);
    const sheet = await openSheetFor('Budget passes');
    expect(await within(sheet).findByTestId('sheet-more-from')).toBeInTheDocument();
    expect(within(sheet).queryByTestId('open-with-control')).toBeNull();
  });
});

describe('Settings → Publishers → Open with', () => {
  const sourcesMock = { request: { query: GET_NEWS_SOURCES, variables: {} }, result: { data: { newsSources: [ARK] } }, maxUsageCount: 3 };

  it('lists each override as “publisher → link”, and “Use original” removes it', async () => {
    const calls = [];
    renderWithProviders(<SettingsView />, {
      mocks: [
        prefsMock({ readerLinks: [R1, R2], openers: [opener({ domain: 'reuters.com', linkId: 'bbb222' }), opener({ sourceId: 's1', linkId: 'aaa111' })] }),
        pubPrefsMock,
        sourcesMock,
        openerMock({ sourceId: 's1', linkId: null }, { data: { newsSetPublisherOpener: newsPrefs({ readerLinks: [R1, R2], openers: [opener({ domain: 'reuters.com', linkId: 'bbb222' })] }) } }, calls),
      ],
    });
    const list = await screen.findByTestId('publisher-openers');
    const rows = await within(list).findAllByTestId('opener-row');
    expect(rows.map((r) => r.firstChild.textContent)).toEqual(['reuters.com→ opens with Reader two', 'The Arkadelphian→ opens with Reader one']);
    await userEvent.click(within(list).getByRole('button', { name: 'Open The Arkadelphian stories at the publisher' }));
    await waitFor(() => expect(calls).toEqual([{ sourceId: 's1', linkId: null }]));
    await waitFor(() => expect(within(list).getAllByTestId('opener-row')).toHaveLength(1));
    expect(within(list).getByRole('button', { name: 'Open reuters.com stories at the publisher' })).toHaveTextContent('Use original');
  });

  it('says so when every publisher opens at its own site', async () => {
    renderWithProviders(<SettingsView />, { mocks: [prefsMock({ readerLinks: [R1] }), pubPrefsMock, sourcesMock] });
    expect(await screen.findByTestId('publisher-openers-empty')).toHaveTextContent('Every publisher opens at its own site.');
  });
});
