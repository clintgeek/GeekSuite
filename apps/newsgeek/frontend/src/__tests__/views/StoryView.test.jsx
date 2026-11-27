/**
 * The story page (`/story/:id`, 2026-11-27): one story as every outlet told
 * it. The headline Today would show, "N sources · Section", then one item per
 * telling, each a link out; "All coverage →" from a story's Also-in list leads
 * here; a story that is gone says so.
 */
import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import ArticleItem from '../../components/ArticleItem';
import { ALL_COVERAGE } from '../../components/AlsoIn';
import { GET_NEWS_PREFS, GET_NEWS_STORY } from '../../graphql/queries';
import { AppRoutes } from '../../App';
import StoryView, { BACK_LINK, GONE_LINE, sourcesLine } from '../../views/StoryView';
import { article, copy, newsPrefs } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const prefsMock = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: [] } } }, maxUsageCount: 5 };
const telling = (id, o) => article(id, { storyId: 'st1', ...o });
const STORY = {
  __typename: 'NewsStory',
  id: 'st1',
  title: 'Court strikes down the tariff order',
  section: 'national',
  sourceCount: 3,
  firstAt: '2026-11-26T12:00:00.000Z',
  lastAt: '2026-11-27T09:00:00.000Z',
  articles: [
    telling('a3', { title: 'Justices void the tariff order', publisher: 'PBS NewsHour', sourceName: 'PBS NewsHour', sourceId: 'pbs', url: 'https://pbs.org/a3', publisherDomain: 'pbs.org' }),
    telling('a2', { title: 'Tariff order falls at the Supreme Court', publisher: 'The Hill', sourceName: 'The Hill', sourceId: 'hill', url: 'https://thehill.com/a2', publisherDomain: 'thehill.com' }),
    telling('a1', {
      title: 'Court strikes down the tariff order', publisher: 'AP News', sourceName: 'Google News', sourceId: 'gn', url: 'https://apnews.com/a1', publisherDomain: 'apnews.com',
      alsoIn: [copy('KATV', 'https://katv.com/a1')],
    }),
  ],
};
const storyMock = (newsStory, id = 'st1') => ({ request: { query: GET_NEWS_STORY, variables: { id } }, result: { data: { newsStory } } });
const renderStory = (mocks) => renderWithProviders(<StoryView />, { path: '/story/:id', initialEntries: ['/story/st1'], mocks: [prefsMock, ...mocks] });

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

describe('sourcesLine', () => {
  it('counts outlets in words', () => {
    expect(sourcesLine(12)).toBe('12 sources');
    expect(sourcesLine(1)).toBe('1 source');
  });
});

describe('the story page', () => {
  it('shows the headline, how many told it and where it belongs, then every telling as a link out', async () => {
    renderStory([storyMock(STORY)]);
    const story = await screen.findByTestId('story');
    expect(within(story).getByRole('heading', { level: 2, name: 'Court strikes down the tariff order' })).toBeInTheDocument();
    expect(within(story).getByTestId('story-meta')).toHaveTextContent('3 sources · National');
    const tellings = within(story).getAllByTestId('article');
    expect(tellings.map((t) => within(t).getByRole('heading', { level: 3 }).textContent.replace(/\s*\(opens.*$/, ''))).toEqual([
      'Justices void the tariff order', 'Tariff order falls at the Supreme Court', 'Court strikes down the tariff order',
    ]);
    expect(within(tellings[0]).getByRole('link', { name: /Justices void the tariff order/ })).toHaveAttribute('href', 'https://pbs.org/a3');
    expect(within(tellings[1]).getByText('The Hill')).toBeInTheDocument();
  });

  it('a telling’s copies are still under "Also in", without a second "All coverage" link', async () => {
    renderStory([storyMock(STORY)]);
    const story = await screen.findByTestId('story');
    await userEvent.click(within(story).getByRole('button', { name: 'Also in KATV' }));
    expect(within(story).getByRole('link', { name: 'KATV' })).toHaveAttribute('href', 'https://katv.com/a1');
    expect(within(story).queryByTestId('all-coverage')).toBeNull();
  });

  it('a story that is gone says so and offers the way back', async () => {
    renderStory([storyMock(null)]);
    expect(await screen.findByText(GONE_LINE)).toBeInTheDocument();
    expect(screen.queryByTestId('story')).toBeNull();
    expect(screen.getByRole('link', { name: BACK_LINK })).toHaveAttribute('href', '/');
  });

  it('a failed load says so, with a retry', async () => {
    renderStory([{ request: { query: GET_NEWS_STORY, variables: { id: 'st1' } }, error: new Error('down') }]);
    expect(await screen.findByTestId('story-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('"All coverage →"', () => {
  const withCopies = (o = {}) => article('a1', { title: 'AP: Lawmakers pass a budget', alsoIn: [copy('KARK', 'https://www.kark.com/x')], ...o });

  it('ends a story’s Also-in list when the story has a page, and leads to it', async () => {
    renderWithProviders(
      <>
        <ArticleItem article={withCopies({ storyId: 'st1' })} />
        <Where />
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Also in KARK' }));
    const link = screen.getByRole('link', { name: ALL_COVERAGE });
    expect(link).toHaveAttribute('href', '/story/st1');
    await userEvent.click(link);
    expect(screen.getByTestId('where')).toHaveTextContent('/story/st1');
  });

  it('is not there for an article with no story yet', async () => {
    renderWithProviders(<ArticleItem article={withCopies({ storyId: null })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Also in KARK' }));
    expect(screen.queryByRole('link', { name: ALL_COVERAGE })).toBeNull();
  });

  it('/story/:id is a route', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/story/st1'], mocks: [prefsMock, storyMock(STORY)] });
    expect(await screen.findByTestId('story')).toBeInTheDocument();
  });
});
