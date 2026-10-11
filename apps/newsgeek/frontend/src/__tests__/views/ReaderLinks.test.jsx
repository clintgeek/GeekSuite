/**
 * "Open with…": the ⋯ menu on a story, the headline that always goes to the
 * publisher, and Settings → Open-with links.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import ArticleItem from '../../components/ArticleItem';
import { SET_NEWS_PREFS } from '../../graphql/mutations';
import { GET_NEWS_PREFS } from '../../graphql/queries';
import SettingsView from '../../views/SettingsView';
import { article } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const LINKS = [
  { __typename: 'NewsReaderLink', label: 'Reader one', template: 'https://example.com/read?u={url}' },
  { __typename: 'NewsReaderLink', label: 'Reader two', template: 'https://example.org/{url}?t={title}' },
];
const STORY = article('a1', { title: 'Fire & ice', url: 'https://pub.example/a?b=1' });

let open;
beforeEach(() => {
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => open.mockRestore());

describe('a story’s ⋯ menu', () => {
  it('lists "Open at publisher" first, then the reader’s links in order', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: 'More ways to open “Fire & ice”' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Reader one', 'Reader two']);
  });

  it('opens a reader link with the built URL and noopener,noreferrer', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: /More ways to open/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reader two' }));
    expect(open).toHaveBeenCalledWith('https://example.org/https%3A%2F%2Fpub.example%2Fa%3Fb%3D1?t=Fire%20%26%20ice', '_blank', 'noopener,noreferrer');
  });

  it('"Open at publisher" opens the article url', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: /More ways to open/ }));
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
    await userEvent.click(screen.getByRole('button', { name: /More ways to open/ }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Add open-with links…']);
    await userEvent.click(items[1]);
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });

  it('the headline always opens the publisher, even with reader links set', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    const headline = screen.getByRole('link', { name: /Fire & ice/ });
    expect(headline).toHaveAttribute('href', 'https://pub.example/a?b=1');
    expect(headline).toHaveAttribute('target', '_blank');
    await userEvent.click(headline);
    const built = open.mock.calls.map((c) => c[0]).filter((u) => /example\.(com|org)/.test(u));
    expect(built).toEqual([]);
  });
});

describe('Settings → Open-with links', () => {
  const prefsMock = (readerLinks) => ({
    request: { query: GET_NEWS_PREFS },
    result: { data: { newsPrefs: { __typename: 'NewsPrefs', freeToReadOnly: false, readerLinks } } },
  });

  it('starts empty, validates like the gateway, and saves the whole list', async () => {
    const saved = vi.fn();
    const saveMock = {
      request: { query: SET_NEWS_PREFS },
      variableMatcher: () => true,
      result: (vars) => {
        saved(vars);
        return { data: { newsSetPrefs: { __typename: 'NewsPrefs', freeToReadOnly: false, readerLinks: vars.input.readerLinks.map((l) => ({ __typename: 'NewsReaderLink', ...l })) } } };
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
    const five = Array.from({ length: 5 }, (_, i) => ({ __typename: 'NewsReaderLink', label: `L${i}`, template: `https://example.com/${i}?u={url}` }));
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(five)] });
    expect(await screen.findAllByTestId('reader-link-row')).toHaveLength(5);
    expect(screen.getByRole('button', { name: '5 is the most' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove L2' }));
    expect(screen.getAllByTestId('reader-link-row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Add a link' })).toBeEnabled();
  });
});
