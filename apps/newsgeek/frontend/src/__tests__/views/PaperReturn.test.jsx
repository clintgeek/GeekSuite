/**
 * Coming back to the paper (SUITE_REVIEW_2026-11 NewsGeek findings 1, 2, 4):
 *  - the PWA resumes: at the top the list refreshes quietly; scrolled down,
 *    nothing moves and a "N new stories" bar waits;
 *  - Back keeps the list "Older stories" grew (and, after a reload, asks for
 *    as many stories again);
 *  - an "Older stories" failure is said, with Try again;
 *  - Today's masthead says when the paper was set.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { GET_NEWS_ARTICLES, GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../../graphql/queries';
import AppMain from '../../components/AppMain';
import LatestView from '../../views/LatestView';
import TodayView from '../../views/TodayView';
import { writeCount } from '../../hooks/scrollMemory';
import { PAPER_RESUME_MIN_MS } from '../../hooks/usePaperRefresh';
import { article, newsPrefs } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const page = (items, nextCursor = null) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextCursor, hiddenPaywalled: 0 } } });
const articlesMock = (variables, result, extra = {}) => ({ request: { query: GET_NEWS_ARTICLES, variables }, result, ...extra });
const prefsMock = () => ({ request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: [] } } }, maxUsageCount: 10 });
const CURSOR = '1760000000000.0123456789abcdef01234567';

/** Come back to the app, later than the resume throttle. */
function resume() {
  const later = Date.now() + PAPER_RESUME_MIN_MS + 1000;
  vi.setSystemTime(later);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Older stories failure (finding 4)', () => {
  it('says so with Try again, and Try again appends the page', async () => {
    const mocks = [
      prefsMock(),
      articlesMock({ limit: 30 }, page([article('n1'), article('n2')], CURSOR)),
      articlesMock({ limit: 30, cursor: CURSOR }, undefined, { error: new Error('Network request failed') }),
      articlesMock({ limit: 30, cursor: CURSOR }, page([article('o1', { title: 'Older headline' })])),
    ];
    renderWithProviders(<LatestView />, { mocks });
    await userEvent.click(await screen.findByRole('button', { name: 'Older stories' }));
    expect(await screen.findByTestId('older-failed')).toHaveTextContent('Couldn’t fetch older stories.');
    expect(screen.getAllByTestId('article')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Older headline/ })).toBeInTheDocument();
    expect(screen.queryByTestId('older-failed')).toBeNull();
  });
});

describe('a failed first load (GeekLoadError)', () => {
  it('Everything: says the paper didn’t arrive, with Try again that loads it', async () => {
    const mocks = [
      prefsMock(),
      articlesMock({ limit: 30 }, undefined, { error: new Error('Network request failed') }),
      articlesMock({ limit: 30 }, page([article('n1', { title: 'Back on the wire' })])),
    ];
    renderWithProviders(<LatestView />, { mocks });
    const alert = await screen.findByTestId('paper-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('The paper didn’t arrive.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Back on the wire/ })).toBeInTheDocument();
  });
});

describe('resume refresh (finding 1)', () => {
  it('at the top: refetches quietly and the new story appears', async () => {
    const mocks = [
      prefsMock(),
      articlesMock({ limit: 30 }, page([article('a1', { title: 'Morning story' })])),
      articlesMock({ limit: 30 }, page([article('a0', { title: 'Lunchtime story' }), article('a1', { title: 'Morning story' })])),
    ];
    renderWithProviders(<LatestView />, { mocks });
    await screen.findByRole('link', { name: /Morning story/ });
    resume();
    expect(await screen.findByRole('link', { name: /Lunchtime story/ })).toBeInTheDocument();
    expect(screen.queryByTestId('new-stories')).toBeNull();
  });

  it('scrolled down: nothing moves; a "new stories" bar waits, and tapping it prints the new paper', async () => {
    const fresh = page([article('a0', { title: 'Lunchtime story' }), article('z9', { title: 'Another new one' }), article('a1', { title: 'Morning story' })]);
    const mocks = [
      prefsMock(),
      articlesMock({ limit: 30 }, page([article('a1', { title: 'Morning story' })])),
      articlesMock({ limit: 30 }, fresh), // the peek (not written to the cache)
      articlesMock({ limit: 30 }, fresh), // "Show": the refetch
    ];
    const { container } = renderWithProviders(
      <AppMain transitionKey="/everything">
        <LatestView />
      </AppMain>,
      { mocks, initialEntries: ['/everything'] }
    );
    await screen.findByRole('link', { name: /Morning story/ });
    const main = container.querySelector('main');
    let top = 900;
    Object.defineProperty(main, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });

    resume();
    const bar = await screen.findByRole('button', { name: 'Show 2 new stories' });
    // The list under the reader's thumb did not change.
    expect(screen.getAllByTestId('article')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Lunchtime story/ })).toBeNull();

    await userEvent.click(bar);
    expect(top).toBe(0);
    expect(await screen.findByRole('link', { name: /Lunchtime story/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('article')).toHaveLength(3);
    expect(screen.queryByTestId('new-stories')).toBeNull();
  });
});

function Away() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}
function GoAway() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/elsewhere')}>
      Leave
    </button>
  );
}

describe('Back keeps your place (finding 2)', () => {
  it('a list grown by "Older stories" is still whole after Back (no page-one refetch over it)', async () => {
    const pageOne = vi.fn(() => page([article('n1'), article('n2')], CURSOR));
    const mocks = [
      prefsMock(),
      articlesMock({ limit: 30 }, pageOne, { maxUsageCount: 5 }),
      articlesMock({ limit: 30, cursor: CURSOR }, page([article('o1', { title: 'Older headline' })])),
    ];
    renderWithProviders(
      <Routes>
        <Route
          path="/everything"
          element={
            <>
              <GoAway />
              <LatestView />
            </>
          }
        />
        <Route path="/elsewhere" element={<Away />} />
      </Routes>,
      { mocks, initialEntries: ['/everything'] }
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Older stories' }));
    await screen.findByRole('link', { name: /Older headline/ });
    expect(screen.getAllByTestId('article')).toHaveLength(3);
    const calls = pageOne.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('link', { name: /Older headline/ })).toBeInTheDocument();
    // Give a network refetch the chance to land, then check nothing replaced the list.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getAllByTestId('article')).toHaveLength(3);
    expect(pageOne.mock.calls.length).toBe(calls);
  });

  it('after a reload (nothing cached), Back asks for as many stories as the reader had', async () => {
    writeCount('/everything', 45);
    const mocks = [prefsMock(), articlesMock({ limit: 45 }, page([article('n1', { title: 'Restored list' })], CURSOR))];
    renderWithProviders(<LatestView />, { mocks, initialEntries: ['/everything'] });
    expect(await screen.findByRole('link', { name: /Restored list/ })).toBeInTheDocument();
  });
});

describe('Today', () => {
  const front = (stories, generatedAt = '2026-10-11T12:05:00.000Z') => ({
    data: {
      newsFrontPage: {
        __typename: 'NewsFrontPage',
        generatedAt,
        sections: [{ __typename: 'NewsFrontSection', key: 'local', title: 'Local', moreCount: 0, items: stories.map((s) => ({ ...s, section: 'local', why: [] })) }],
      },
    },
  });
  const frontMock = (result, extra = {}) => ({ request: { query: GET_NEWS_FRONT_PAGE }, result, ...extra });

  it('the masthead says when the paper was set (America/Chicago)', async () => {
    renderWithProviders(<TodayView />, { mocks: [prefsMock(), frontMock(front([article('l1')]))] });
    expect(await screen.findByTestId('masthead-updated')).toHaveTextContent('Updated 7:05 AM');
  });

  it('resume while scrolled down: a "new stories" bar, not a reordered page', async () => {
    const fresh = front([article('l0', { title: 'Fresh local story' }), article('l1', { title: 'Old local story' })], '2026-10-11T18:00:00.000Z');
    const mocks = [prefsMock(), frontMock(front([article('l1', { title: 'Old local story' })])), frontMock(fresh), frontMock(fresh)];
    const { container } = renderWithProviders(
      <AppMain transitionKey="/">
        <TodayView />
      </AppMain>,
      { mocks }
    );
    await screen.findByRole('link', { name: /Old local story/ });
    const main = container.querySelector('main');
    Object.defineProperty(main, 'scrollTop', { configurable: true, get: () => 900, set: () => {} });
    resume();
    await screen.findByRole('button', { name: 'Show 1 new story' });
    expect(screen.queryByRole('link', { name: /Fresh local story/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show 1 new story' }));
    expect(await screen.findByRole('link', { name: /Fresh local story/ })).toBeInTheDocument();
    expect(screen.getByTestId('masthead-updated')).toHaveTextContent('Updated 1:00 PM');
  });

  it('a failed front page is a GeekLoadError with Try again, never the empty paper', async () => {
    const mocks = [prefsMock(), frontMock(undefined, { error: new Error('Network request failed') }), frontMock(front([article('l1', { title: 'Arrived' })]))];
    renderWithProviders(<TodayView />, { mocks });
    expect(await screen.findByTestId('paper-error')).toHaveTextContent('The paper didn’t arrive.');
    expect(screen.queryByTestId('today-empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Arrived/ })).toBeInTheDocument();
  });
});
