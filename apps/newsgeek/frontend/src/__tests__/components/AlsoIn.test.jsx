/**
 * "Also in KARK +2" (NewsArticle.alsoIn, feed hygiene): the other copies of
 * a collapsed story. A quiet button under the story that opens a list of
 * links to each copy at its publisher; nothing when there are none. It shows
 * wherever a story does — Today, Everything, the section pages — because both
 * article queries select alsoIn.
 */
import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArticleItem from '../../components/ArticleItem';
import { alsoInLabel } from '../../components/AlsoIn';
import { GET_NEWS_ARTICLES, GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../../graphql/queries';
import LatestView from '../../views/LatestView';
import TodayView from '../../views/TodayView';
import { article, copy, newsPrefs } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const COPIES = [
  copy('KARK', 'https://www.kark.com/news/ap-story/'),
  copy('THV11', 'https://www.thv11.com/article/ap-story/'),
  copy('Arkansas Times', 'https://arktimes.com/ap-story/'),
];

const prefsMock = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: [] } } }, maxUsageCount: 5 };

describe('alsoInLabel', () => {
  it('names the first publisher and counts the rest', () => {
    expect(alsoInLabel(COPIES)).toBe('Also in KARK +2');
    expect(alsoInLabel(COPIES.slice(0, 1))).toBe('Also in KARK');
    expect(alsoInLabel([])).toBeNull();
    expect(alsoInLabel(undefined)).toBeNull();
  });
});

describe('Also in (ArticleItem)', () => {
  it('shows "Also in KARK +2", collapsed; a tap opens the list of copies, each a link out in a new tab', async () => {
    renderWithProviders(<ArticleItem article={article('a1', { title: 'AP: Lawmakers pass a budget', alsoIn: COPIES })} />);
    const story = screen.getByTestId('article');
    const btn = within(story).getByRole('button', { name: 'Also in KARK +2' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    const list = document.getElementById(btn.getAttribute('aria-controls'));
    expect(list).not.toBeNull();
    expect(list).not.toBeVisible();
    expect(within(story).queryByRole('link', { name: 'KARK' })).toBeNull();

    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(list).toBeVisible();
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['KARK', 'THV11', 'Arkansas Times']);
    links.forEach((l, i) => {
      expect(l).toHaveAttribute('href', COPIES[i].url);
      expect(l).toHaveAttribute('target', '_blank');
      expect(l).toHaveAttribute('rel', 'noopener noreferrer');
    });
    // The headline still goes to this copy.
    expect(within(story).getByRole('link', { name: /AP: Lawmakers pass a budget/ })).toHaveAttribute('href', 'https://arkadelphian.com/a1/');

    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(list).not.toBeVisible();
  });

  it('one other copy: "Also in KARK", no count', () => {
    renderWithProviders(<ArticleItem article={article('a1', { alsoIn: COPIES.slice(0, 1) })} />);
    expect(screen.getByRole('button', { name: 'Also in KARK' })).toBeInTheDocument();
  });

  it('is not there at all when the story has no other copies (or the field is missing)', () => {
    const { unmount } = renderWithProviders(<ArticleItem article={article('a1', { alsoIn: [] })} />);
    expect(screen.queryByTestId('also-in')).toBeNull();
    expect(screen.queryByRole('button', { name: /also in/i })).toBeNull();
    unmount();
    const bare = article('a2');
    delete bare.alsoIn;
    renderWithProviders(<ArticleItem article={bare} />);
    expect(screen.queryByTestId('also-in')).toBeNull();
  });
});

describe('Also in, through the queries', () => {
  it('Today selects alsoIn: the front page shows the line', async () => {
    const story = { ...article('t1', { title: 'AP story on Today', alsoIn: COPIES }), section: 'state', why: [] };
    const front = {
      request: { query: GET_NEWS_FRONT_PAGE },
      result: { data: { newsFrontPage: { __typename: 'NewsFrontPage', generatedAt: '2026-10-11T12:00:00.000Z', sections: [{ __typename: 'NewsFrontSection', key: 'state', title: 'State', moreCount: 0, items: [story] }] } } },
    };
    renderWithProviders(<TodayView />, { mocks: [prefsMock, front] });
    expect(await screen.findByRole('button', { name: 'Also in KARK +2' })).toBeInTheDocument();
  });

  it('Everything selects alsoIn: the list shows the line', async () => {
    const page = { data: { newsArticles: { __typename: 'NewsArticlePage', items: [article('e1', { alsoIn: COPIES.slice(0, 2) })], nextBefore: null, hiddenPaywalled: 0 } } };
    renderWithProviders(<LatestView />, { mocks: [prefsMock, { request: { query: GET_NEWS_ARTICLES, variables: { limit: 30 } }, result: page }] });
    expect(await screen.findByRole('button', { name: 'Also in KARK +1' })).toBeInTheDocument();
  });
});
