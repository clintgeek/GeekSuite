/**
 * Today (`/`): the ranked front page. Sections in the gateway's order, each
 * with a small-caps heading, its stories with why-chips, and "More <section>
 * →" when the cap left stories out; an empty section isn't printed; the
 * paper has an end line that leads to Everything; old `/?source=` links go
 * to Everything.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../../graphql/queries';
import { SET_NEWS_PREFS } from '../../graphql/mutations';
import { AppRoutes } from '../../App';
import TodayView from '../../views/TodayView';
import { article, newsPrefs } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const prefsMock = (freeToReadOnly = false) => ({
  request: { query: GET_NEWS_PREFS },
  result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly, readerLinks: [] } } },
  maxUsageCount: 5,
});
const story = (id, o = {}) => ({ ...article(id, o), section: o.section ?? 'local', why: o.why ?? [] });
const section = (key, title, items, moreCount = 0) => ({ __typename: 'NewsFrontSection', key, title, items, moreCount });
const frontMock = (sections, extra = {}) => ({
  request: { query: GET_NEWS_FRONT_PAGE },
  result: { data: { newsFrontPage: { __typename: 'NewsFrontPage', generatedAt: '2026-10-11T12:00:00.000Z', sections } } },
  ...extra,
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

const PAPER = [
  section('local', 'Local', [
    story('l1', { title: 'Arkadelphia council meets Tuesday', why: ['Arkadelphia', '★ Favorite'] }),
    story('l2', { title: 'Gurdon water main repaired', why: ['Gurdon'] }),
  ], 6),
  section('state', 'State', [story('s1', { title: 'Legislature opens fiscal session', section: 'state', why: ['Arkansas'] })], 0),
  section('national', 'National', [story('n1', { title: 'Senate passes a stopgap', section: 'national' })], 12),
  section('tech', 'Tech', [], 0),
];

describe('Today — opening (plan "Opening")', () => {
  it('a headline follows the reader’s opener and window mode', async () => {
    const prefs = {
      request: { query: GET_NEWS_PREFS },
      result: {
        data: {
          newsPrefs: newsPrefs({
            openInNewTab: false,
            readerLinks: [{ __typename: 'NewsReaderLink', id: 'aaa111', label: 'Reader one', template: 'https://example.com/read?u={url}' }],
            openers: [{ __typename: 'NewsOpener', sourceId: 's1', domain: null, linkId: 'aaa111' }],
          }),
        },
      },
      maxUsageCount: 5,
    };
    renderWithProviders(<TodayView />, { mocks: [prefs, frontMock(PAPER)] });
    const link = await screen.findByRole('link', { name: /Arkadelphia council meets Tuesday/ });
    await waitFor(() => expect(link).toHaveAttribute('href', 'https://example.com/read?u=https%3A%2F%2Farkadelphian.com%2Fl1%2F'));
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});

describe('Today — Around Arkansas', () => {
  it('prints Around Arkansas last, under its own heading, with “More Around Arkansas →” to /s/around', async () => {
    const paper = [
      ...PAPER,
      section('around', 'Around Arkansas', [story('r1', { title: 'DeWitt calendar of events', section: 'around', why: ['Arkansas'] })], 4),
    ];
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(paper)] });
    const blocks = await screen.findAllByTestId('front-section');
    expect(blocks.map((b) => b.getAttribute('data-section'))).toEqual(['local', 'state', 'national', 'around']);
    const around = blocks[3];
    expect(within(around).getByRole('heading', { level: 2 })).toHaveTextContent('Around Arkansas');
    expect(within(around).getByTestId('more-link')).toHaveAttribute('href', '/s/around');
    expect(within(around).getByTestId('more-link')).toHaveTextContent('More Around Arkansas →');
  });
});

describe('Today', () => {
  it('prints the sections in the gateway’s order, each with its heading, stories and why-chips', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(PAPER)] });
    const blocks = await screen.findAllByTestId('front-section');
    expect(blocks.map((b) => b.getAttribute('data-section'))).toEqual(['local', 'state', 'national']);
    expect(blocks.map((b) => within(b).getByRole('heading', { level: 2 }).textContent)).toEqual(['Local', 'State', 'National']);
    // Each section is a landmark named by its heading.
    expect(screen.getByRole('region', { name: 'Local' })).toBe(blocks[0]);

    const local = within(blocks[0]).getAllByTestId('article');
    expect(local).toHaveLength(2);
    expect(within(local[0]).getAllByTestId('why-chip').map((c) => c.textContent)).toEqual(['Arkadelphia', '★ Favorite']);
    expect(within(local[1]).getAllByTestId('why-chip').map((c) => c.textContent)).toEqual(['Gurdon']);
    // Why-chips replace the place chips on Today.
    expect(within(local[0]).queryByRole('list', { name: 'Places' })).toBeNull();
    // A story with no reasons gets no empty chip row.
    expect(within(blocks[2]).queryByTestId('why-chips')).toBeNull();
  });

  it('"More <section> →" links to the section page only when stories were left out', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(PAPER)] });
    const blocks = await screen.findAllByTestId('front-section');
    expect(within(blocks[0]).getByRole('link', { name: 'More Local →' })).toHaveAttribute('href', '/s/local');
    expect(within(blocks[1]).queryByTestId('more-link')).toBeNull();
    expect(within(blocks[2]).getByRole('link', { name: 'More National →' })).toHaveAttribute('href', '/s/national');
  });

  it('an empty section is not printed', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(PAPER)] });
    await screen.findAllByTestId('front-section');
    expect(screen.queryByRole('heading', { name: 'Tech' })).toBeNull();
    expect(document.querySelector('[data-section="tech"]')).toBeNull();
  });

  it('ends: "That’s today’s paper." and a link to Everything', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(PAPER)] });
    const end = await screen.findByTestId('today-end');
    expect(end).toHaveTextContent('That’s today’s paper.');
    expect(within(end).getByRole('link', { name: 'Everything, newest first →' })).toHaveAttribute('href', '/everything');
    // The end comes after the last section.
    const blocks = screen.getAllByTestId('front-section');
    expect(blocks[blocks.length - 1].compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the lead story of the paper is set a size up; the rest are not', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(PAPER)] });
    const blocks = await screen.findAllByTestId('front-section');
    const stories = screen.getAllByTestId('article');
    expect(stories.filter((a) => a.getAttribute('data-lead') === 'true')).toEqual([within(blocks[0]).getAllByTestId('article')[0]]);
    // Stories sit under their section heading: h3 under the h2.
    expect(within(blocks[1]).getByRole('heading', { level: 3, name: /Legislature opens fiscal session/ })).toBeInTheDocument();
  });

  it('a front page with nothing on it says so, and still leads to Everything', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock([section('local', 'Local', [])])] });
    expect(await screen.findByTestId('today-empty')).toHaveTextContent(/Nothing on the front page yet/);
    expect(screen.queryByTestId('front-section')).toBeNull();
    expect(screen.queryByText('That’s today’s paper.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Everything, newest first →' })).toHaveAttribute('href', '/everything');
  });

  it('Free to read: sends newsSetPrefs, then asks for a fresh front page', async () => {
    const asked = [];
    const calls = [];
    renderWithProviders(<TodayView />, {
      mocks: [
        prefsMock(false),
        frontMock(PAPER, { result: () => { asked.push('front'); return frontMock(PAPER).result; } }),
        {
          request: { query: SET_NEWS_PREFS, variables: { input: { freeToReadOnly: true } } },
          result: () => {
            calls.push(true);
            return { data: { newsSetPrefs: { ...newsPrefs(), freeToReadOnly: true, readerLinks: [] } } };
          },
        },
        frontMock([section('local', 'Local', [story('free1', { title: 'A free story' })])], { result: () => { asked.push('front'); return frontMock([section('local', 'Local', [story('free1', { title: 'A free story' })])]).result; } }),
      ],
    });
    await screen.findAllByTestId('front-section');
    const sw = screen.getByRole('switch', { name: 'Free to read' });
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw);
    await waitFor(() => expect(calls).toEqual([true]));
    expect(await screen.findByRole('link', { name: /A free story/ })).toBeInTheDocument();
    expect(asked).toEqual(['front', 'front']);
  });
});

describe('Old links', () => {
  it('`/?source=<id>` goes to Everything with the same query', async () => {
    renderWithProviders(
      <>
        <AppRoutes />
        <Where />
      </>,
      { mocks: [], initialEntries: ['/?source=s1'] }
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/everything?source=s1'));
  });

  it('`/?section=tech` goes to Everything with the same query', async () => {
    renderWithProviders(
      <>
        <AppRoutes />
        <Where />
      </>,
      { mocks: [], initialEntries: ['/?section=tech'] }
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/everything?section=tech'));
  });
});
