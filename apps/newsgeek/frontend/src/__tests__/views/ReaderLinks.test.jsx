/**
 * "Open with…": the ⋯ menu on a story, where the headline goes (the publisher,
 * unless the reader chose another opener for it — plan "Opening", Chef
 * 2026-10-11; "Open at publisher" and Also-in always use the original), the
 * window mode on every outbound link, Settings → Reading and Settings →
 * Open-with links.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import ArticleItem from '../../components/ArticleItem';
import { pageNavigation } from '../../utils/openUrl';
import { SET_NEWS_PREFS } from '../../graphql/mutations';
import { GET_NEWS_PREFS } from '../../graphql/queries';
import SettingsView from '../../views/SettingsView';
import { article, copy, newsPrefs, opener } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const LINKS = [
  { __typename: 'NewsReaderLink', id: 'aaa111', label: 'Reader one', template: 'https://example.com/read?u={url}' },
  { __typename: 'NewsReaderLink', id: 'bbb222', label: 'Reader two', template: 'https://example.org/{url}?t={title}' },
];
const STORY = article('a1', { title: 'Fire & ice', url: 'https://pub.example/a?b=1' });

let open;
let assign;
beforeEach(() => {
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
  assign = vi.spyOn(pageNavigation, 'assign').mockImplementation(() => {});
});
afterEach(() => {
  open.mockRestore();
  assign.mockRestore();
});

describe('a story’s ⋯ menu', () => {
  it('lists "Open at publisher" first, then the reader’s links in order', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: 'More for “Fire & ice”' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Reader one', 'Reader two']);
  });

  it('opens a reader link with the built URL and noopener,noreferrer', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reader two' }));
    expect(open).toHaveBeenCalledWith('https://example.org/https%3A%2F%2Fpub.example%2Fa%3Fb%3D1?t=Fire%20%26%20ice', '_blank', 'noopener,noreferrer');
  });

  it('"Open at publisher" opens the article url', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open at publisher' }));
    expect(open).toHaveBeenCalledWith('https://pub.example/a?b=1', '_blank', 'noopener,noreferrer');
  });

  it('with no links: just "Open at publisher" and "Add open-with links…", which goes to Settings', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ArticleItem article={STORY} readerLinks={[]} />} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    );
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Add open-with links…']);
    await userEvent.click(items[1]);
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });

  it('with reader links but no opener for this publisher, the headline opens the publisher', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} openers={[opener({ sourceId: 'elsewhere', linkId: 'aaa111' })]} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).toHaveAttribute('href', 'https://pub.example/a?b=1');
    expect(headline).toHaveAttribute('target', '_blank');
    expect(headline).toHaveAccessibleName('Fire & ice (opens at The Arkadelphian, in a new tab)');
  });
});

// The changed tap rule (Chef, 2026-10-11): the headline opens the publisher
// UNLESS the reader chose another opener for it.
describe('a per-publisher opener', () => {
  const withOpener = { readerLinks: LINKS, openers: [opener({ sourceId: 's1', linkId: 'bbb222' })] };

  it('the headline opens with the chosen link, and says so', () => {
    renderWithProviders(<ArticleItem article={STORY} {...withOpener} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).toHaveAttribute('href', 'https://example.org/https%3A%2F%2Fpub.example%2Fa%3Fb%3D1?t=Fire%20%26%20ice');
    expect(headline).toHaveAccessibleName('Fire & ice (opens with Reader two, in a new tab)');
  });

  it('"Open at publisher" still opens the original link', async () => {
    renderWithProviders(<ArticleItem article={STORY} {...withOpener} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open at publisher' }));
    expect(open).toHaveBeenCalledWith('https://pub.example/a?b=1', '_blank', 'noopener,noreferrer');
  });

  it('Also-in links still open each outlet’s original link', async () => {
    const story = { ...STORY, alsoIn: [copy('KARK', 'https://kark.example/a1/')] };
    renderWithProviders(<ArticleItem article={story} {...withOpener} />);
    await userEvent.click(screen.getByRole('button', { name: /Also in KARK/ }));
    expect(screen.getByRole('link', { name: 'KARK' })).toHaveAttribute('href', 'https://kark.example/a1/');
  });

  it('an opener whose link is gone opens the publisher', () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} openers={[opener({ sourceId: 's1', linkId: 'gone00' })]} />);
    expect(screen.getByRole('link', { name: /Fire & ice/ })).toHaveAttribute('href', 'https://pub.example/a?b=1');
  });
});

describe('window mode: every outbound story link', () => {
  const story = { ...STORY, alsoIn: [copy('KARK', 'https://kark.example/a1/')] };

  it('a new tab (the default): headline and Also-in get target _blank, rel noopener noreferrer', async () => {
    renderWithProviders(<ArticleItem article={story} readerLinks={LINKS} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).toHaveAttribute('target', '_blank');
    expect(headline).toHaveAttribute('rel', 'noopener noreferrer');
    await userEvent.click(screen.getByRole('button', { name: /Also in KARK/ }));
    const kark = screen.getByRole('link', { name: 'KARK' });
    expect(kark).toHaveAttribute('target', '_blank');
    expect(kark).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('this window: headline and Also-in are plain links (no target, rel noreferrer)', async () => {
    renderWithProviders(<ArticleItem article={story} readerLinks={LINKS} openInNewTab={false} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).not.toHaveAttribute('target');
    expect(headline).toHaveAttribute('rel', 'noreferrer');
    expect(headline).toHaveAccessibleName('Fire & ice (opens at The Arkadelphian)');
    await userEvent.click(screen.getByRole('button', { name: /Also in KARK/ }));
    const kark = screen.getByRole('link', { name: 'KARK' });
    expect(kark).not.toHaveAttribute('target');
    expect(kark).toHaveAttribute('rel', 'noreferrer');
  });

  it('this window, with an opener: the headline is a plain link to the reader link', () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} openers={[opener({ sourceId: 's1', linkId: 'aaa111' })]} openInNewTab={false} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).toHaveAttribute('href', 'https://example.com/read?u=https%3A%2F%2Fpub.example%2Fa%3Fb%3D1');
    expect(headline).not.toHaveAttribute('target');
  });

  it('this window: "Open at publisher" and a reader link navigate here, never window.open', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} openInNewTab={false} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open at publisher' }));
    expect(assign).toHaveBeenLastCalledWith('https://pub.example/a?b=1');
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reader one' }));
    expect(assign).toHaveBeenLastCalledWith('https://example.com/read?u=https%3A%2F%2Fpub.example%2Fa%3Fb%3D1');
    expect(open).not.toHaveBeenCalled();
  });
});

describe('Settings → Reading', () => {
  const prefsMock = (over = {}) => ({ request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: newsPrefs(over) } } });

  it('“Open stories in a new tab” is on by default, with its help line', async () => {
    renderWithProviders(<SettingsView />, { mocks: [prefsMock()] });
    const reading = await screen.findByTestId('settings-reading');
    expect(within(reading).getByRole('heading', { name: 'Reading' })).toBeInTheDocument();
    const sw = await within(reading).findByRole('switch', { name: 'Open stories in a new tab' });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).toBeChecked();
    expect(within(reading).getByText('Off: stories open here, and Back brings you back to NewsGeek.')).toBeInTheDocument();
  });

  it('turning it off sends newsSetPrefs({ openInNewTab: false }) and nothing else', async () => {
    const sent = vi.fn();
    const saveMock = {
      request: { query: SET_NEWS_PREFS },
      variableMatcher: () => true,
      result: (vars) => {
        sent(vars);
        return { data: { newsSetPrefs: newsPrefs({ openInNewTab: vars.input.openInNewTab }) } };
      },
    };
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(), saveMock] });
    const sw = await screen.findByRole('switch', { name: 'Open stories in a new tab' });
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw);
    await waitFor(() => expect(sent).toHaveBeenCalledWith({ input: { openInNewTab: false } }));
    await waitFor(() => expect(sw).not.toBeChecked());
  });
});

describe('Settings → Open-with links', () => {
  const prefsMock = (readerLinks) => ({
    request: { query: GET_NEWS_PREFS },
    result: { data: { newsPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks } } },
  });

  it('starts empty, validates like the gateway, and saves the whole list', async () => {
    const saved = vi.fn();
    const saveMock = {
      request: { query: SET_NEWS_PREFS },
      variableMatcher: () => true,
      result: (vars) => {
        saved(vars);
        return { data: { newsSetPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: vars.input.readerLinks.map((l, i) => ({ __typename: 'NewsReaderLink', id: `id${i}`, ...l })) } } };
      },
    };
    renderWithProviders(<SettingsView />, { mocks: [prefsMock([]), saveMock] });
    expect(await screen.findByTestId('reader-links-empty')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    await userEvent.type(screen.getByLabelText('Label 1'), '  Reader  ');
    const tpl = screen.getByLabelText('Link template 1');
    expect(tpl).toHaveAttribute('placeholder', 'https://example.com/read?u={url}');
    expect(screen.getByText('{url} becomes the story’s link; {title} its headline')).toBeInTheDocument();
    await userEvent.type(tpl, 'https://example.com/read?t={{title}');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Put \{url\} where/)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();

    await userEvent.clear(tpl);
    await userEvent.type(tpl, 'https://example.com/read?u={{url}&t={{title}');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0][0]).toEqual({ input: { readerLinks: [{ label: 'Reader', template: 'https://example.com/read?u={url}&t={title}' }] } });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('lists the saved links, removes one, and stops adding at five', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ __typename: 'NewsReaderLink', id: `id${i}`, label: `L${i}`, template: `https://example.com/${i}?u={url}` }));
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(five)] });
    expect(await screen.findAllByTestId('reader-link-row')).toHaveLength(5);
    expect(screen.getByRole('button', { name: '5 is the most' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove L2' }));
    expect(screen.getAllByTestId('reader-link-row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Add a link' })).toBeEnabled();
  });
});
