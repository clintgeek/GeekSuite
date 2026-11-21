/**
 * "Open with…": the ⋯ menu on a story, where the headline goes (the publisher,
 * unless the reader chose another opener for it — plan "Opening", Chef
 * 2026-10-11; "Open at publisher" and Also-in always use the original), the
 * window mode on every outbound link, Settings → Reading and Settings →
 * Open-with links.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { GraphQLError } from 'graphql';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import ArticleItem from '../../components/ArticleItem';
import { pageNavigation } from '../../utils/openUrl';
import { SET_NEWS_PREFS, SET_NEWS_PUBLISHER_OPENER } from '../../graphql/mutations';
import { GET_NEWS_PREFS } from '../../graphql/queries';
import SettingsView, { LEAVE_SAVE_FAILED } from '../../views/SettingsView';
import { article, copy, newsPrefs, opener } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const LINKS = [
  { __typename: 'NewsReaderLink', id: 'aaa111', label: 'Reader one', template: 'https://example.com/read?u={url}' },
  { __typename: 'NewsReaderLink', id: 'bbb222', label: 'Reader two', template: 'https://example.org/{url}?t={title}' },
];
/** The gateway's link id is a hash of the template; any stable function of it will do here. */
const idOf = (template) => `h_${template.length}_${template.replace(/[^a-z0-9]/gi, '')}`;
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

describe('Share / Copy link (UX review 2026-11-18, finding 6)', () => {
  const withOpener = { readerLinks: LINKS, openers: [{ __typename: 'NewsOpener', sourceId: 's1', domain: null, linkId: 'aaa111' }] };
  afterEach(() => {
    delete navigator.share;
  });

  it('with a share sheet: "Share…" shares the ORIGINAL url and title, never the opener’s', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    renderWithProviders(<ArticleItem article={STORY} {...withOpener} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({ title: 'Fire & ice', url: 'https://pub.example/a?b=1' });
  });

  it('dismissing the share sheet says nothing', async () => {
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share…' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('without one: "Copy link" copies the original url and says "Link copied."', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArticleItem article={STORY} {...withOpener} />);
    await user.click(screen.getByRole('button', { name: /More for/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect(await screen.findByText('Link copied.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('https://pub.example/a?b=1');
  });
});

describe('a story’s ⋯ menu', () => {
  it('lists "Open at publisher" first, then Copy link (no share sheet here), then the reader’s links in order', async () => {
    renderWithProviders(<ArticleItem article={STORY} readerLinks={LINKS} />);
    await userEvent.click(screen.getByRole('button', { name: 'More for “Fire & ice”' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Copy link', 'Reader one', 'Reader two']);
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

  it('with no links: "Open at publisher", Copy link and "Add open-with links…", which goes to Settings', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ArticleItem article={STORY} readerLinks={[]} />} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    );
    await userEvent.click(screen.getByRole('button', { name: /More for/ }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open at publisher', 'Copy link', 'Add open-with links…']);
    await userEvent.click(items[2]);
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

  const saveMockFor = (saved) => ({
    request: { query: SET_NEWS_PREFS },
    variableMatcher: () => true,
    maxUsageCount: 10,
    result: (vars) => {
      saved(vars);
      return { data: { newsSetPrefs: { ...newsPrefs(), freeToReadOnly: false, readerLinks: vars.input.readerLinks.map((l) => ({ __typename: 'NewsReaderLink', id: idOf(l.template), ...l })) } } };
    },
  });

  /**
   * The gateway, as far as open-with links go: a link's id is a hash of its
   * template, saving the list drops every opener whose link is gone, and an
   * opener write sets one publisher's link.
   */
  const gatewayFor = (start) => {
    const state = { readerLinks: start.readerLinks, openers: start.openers };
    const prefsNow = () => ({ ...newsPrefs(), readerLinks: state.readerLinks, openers: state.openers });
    const linkSaves = vi.fn();
    const openerSaves = vi.fn();
    const mocks = [
      { request: { query: GET_NEWS_PREFS }, result: () => ({ data: { newsPrefs: prefsNow() } }), maxUsageCount: 10 },
      {
        request: { query: SET_NEWS_PREFS },
        variableMatcher: () => true,
        maxUsageCount: 10,
        result: (vars) => {
          linkSaves(vars);
          state.readerLinks = vars.input.readerLinks.map((l) => ({ __typename: 'NewsReaderLink', id: idOf(l.template), ...l }));
          const ids = new Set(state.readerLinks.map((l) => l.id));
          state.openers = state.openers.filter((o) => ids.has(o.linkId));
          return { data: { newsSetPrefs: prefsNow() } };
        },
      },
      {
        request: { query: SET_NEWS_PUBLISHER_OPENER },
        variableMatcher: () => true,
        maxUsageCount: 10,
        result: (vars) => {
          openerSaves(vars);
          const same = (o) => (vars.sourceId ? o.sourceId === vars.sourceId : !o.sourceId && o.domain === vars.domain);
          state.openers = [...state.openers.filter((o) => !same(o)), opener({ sourceId: vars.sourceId ?? null, domain: vars.domain ?? null, linkId: vars.linkId })];
          return { data: { newsSetPublisherOpener: prefsNow() } };
        },
      },
    ];
    return { state, mocks, linkSaves, openerSaves };
  };

  it('starts empty, validates like the gateway, and saves the whole list when a field is left — no Save button (finding 12)', async () => {
    const saved = vi.fn();
    renderWithProviders(<SettingsView />, { mocks: [prefsMock([]), saveMockFor(saved)] });
    expect(await screen.findByTestId('reader-links-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    await userEvent.type(screen.getByLabelText('Label 1'), '  Reader  ');
    const tpl = screen.getByLabelText('Link template 1');
    expect(tpl).toHaveAttribute('placeholder', 'https://example.com/read?u={url}');
    expect(screen.getByText('{url} becomes the story’s link; {title} its headline')).toBeInTheDocument();
    await userEvent.type(tpl, 'https://example.com/read?t={{title}');
    await userEvent.tab();
    expect(await screen.findByText(/Put \{url\} where/)).toBeInTheDocument();
    expect(screen.getByTestId('reader-links-status')).toHaveTextContent('Finish the link to save it.');
    expect(saved).not.toHaveBeenCalled();

    await userEvent.clear(tpl);
    await userEvent.type(tpl, 'https://example.com/read?u={{url}&t={{title}');
    await userEvent.tab();
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0][0]).toEqual({ input: { readerLinks: [{ label: 'Reader', template: 'https://example.com/read?u={url}&t={title}' }] } });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('an edit still in its field when the page goes away (Back) is saved, not dropped', async () => {
    const saved = vi.fn();
    const one = [{ __typename: 'NewsReaderLink', id: 'id0', label: 'Reader', template: 'https://example.com/r?u={url}' }];
    const { unmount } = renderWithProviders(<SettingsView />, { mocks: [prefsMock(one), saveMockFor(saved)] });
    const label = await screen.findByLabelText('Label 1');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reader two');
    expect(saved).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ input: { readerLinks: [{ label: 'Reader two', template: 'https://example.com/r?u={url}' }] } }));
  });

  /** Settings with a way to leave it (the route going away) while the toast layer stays. */
  function Leaving() {
    const [here, setHere] = React.useState(true);
    return (
      <>
        {here ? <SettingsView /> : null}
        <button type="button" onClick={() => setHere(false)}>
          Leave
        </button>
      </>
    );
  }
  const one = [{ __typename: 'NewsReaderLink', id: 'id0', label: 'Reader', template: 'https://example.com/r?u={url}' }];
  const failingSave = (sent) => ({
    request: { query: SET_NEWS_PREFS },
    variableMatcher: () => true,
    maxUsageCount: 10,
    result: (vars) => {
      sent(vars);
      return { errors: [new GraphQLError('Gateway down')] };
    },
  });

  it('leaving from a field sends the edit once: the blur’s save, not a second one on the way out', async () => {
    const saved = vi.fn();
    renderWithProviders(<Leaving />, { mocks: [prefsMock(one), saveMockFor(saved)] });
    const label = await screen.findByLabelText('Label 1');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reader two');
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Label 1')).toBeNull());
    // Both sends, had there been two, start before the first answer lands.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('a save on the way out that fails says so in a toast (no field was left first)', async () => {
    const sent = vi.fn();
    renderWithProviders(<Leaving />, { mocks: [prefsMock(one), failingSave(sent)] });
    const label = await screen.findByLabelText('Label 1');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reader two');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText(LEAVE_SAVE_FAILED)).toBeInTheDocument();
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('a blur’s save that fails after the page is gone says so in a toast', async () => {
    const sent = vi.fn();
    renderWithProviders(<Leaving />, { mocks: [prefsMock(one), failingSave(sent)] });
    const label = await screen.findByLabelText('Label 1');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reader two');
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText(LEAVE_SAVE_FAILED)).toBeInTheDocument();
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('Enter (Go on a phone) in a field saves without leaving it', async () => {
    const saved = vi.fn();
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(one), saveMockFor(saved)] });
    const label = await screen.findByLabelText('Label 1');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reader two{Enter}');
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ input: { readerLinks: [{ label: 'Reader two', template: 'https://example.com/r?u={url}' }] } }));
    expect(label).toHaveFocus();
  });

  it('Enter on a half-filled link saves nothing and shows what it needs', async () => {
    const saved = vi.fn();
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(one), saveMockFor(saved)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Add a link' }));
    await userEvent.type(screen.getByLabelText('Label 2'), 'Half{Enter}');
    expect(await screen.findByText('Add the link.')).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });

  it('removing a link saves at once and offers Undo, which puts it back', async () => {
    const saved = vi.fn();
    const two = [0, 1].map((i) => ({ __typename: 'NewsReaderLink', id: idOf(`https://example.com/${i}?u={url}`), label: `L${i}`, template: `https://example.com/${i}?u={url}` }));
    renderWithProviders(<SettingsView />, { mocks: [prefsMock(two), saveMockFor(saved)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove L0' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ input: { readerLinks: [{ label: 'L1', template: 'https://example.com/1?u={url}' }] } }));
    expect(screen.getAllByTestId('reader-link-row')).toHaveLength(1);
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getAllByTestId('reader-link-row')).toHaveLength(2));
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith({ input: { readerLinks: [{ label: 'L0', template: 'https://example.com/0?u={url}' }, { label: 'L1', template: 'https://example.com/1?u={url}' }] } }));
  });

  it('Undo also puts back the publishers that opened with the removed link (the gateway dropped them)', async () => {
    const two = [0, 1].map((i) => ({ __typename: 'NewsReaderLink', id: idOf(`https://example.com/${i}?u={url}`), label: `L${i}`, template: `https://example.com/${i}?u={url}` }));
    const gw = gatewayFor({
      readerLinks: two,
      openers: [
        opener({ sourceId: 's1', domain: null, linkId: two[0].id }),
        opener({ sourceId: null, domain: 'pub.example', linkId: two[0].id }),
        opener({ sourceId: 's2', domain: null, linkId: two[1].id }),
      ],
    });
    renderWithProviders(<SettingsView />, { mocks: gw.mocks });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove L0' }));
    await waitFor(() => expect(gw.linkSaves).toHaveBeenCalledTimes(1));
    expect(gw.state.openers.map((o) => o.sourceId ?? o.domain)).toEqual(['s2']);
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(gw.openerSaves).toHaveBeenCalledTimes(2));
    expect(gw.linkSaves).toHaveBeenLastCalledWith({ input: { readerLinks: [{ label: 'L0', template: 'https://example.com/0?u={url}' }, { label: 'L1', template: 'https://example.com/1?u={url}' }] } });
    expect(gw.openerSaves.mock.calls.map(([v]) => v)).toEqual([
      { sourceId: 's1', linkId: two[0].id },
      { domain: 'pub.example', linkId: two[0].id },
    ]);
    expect(gw.state.openers.map((o) => `${o.sourceId ?? o.domain}→${o.linkId}`).sort()).toEqual([`pub.example→${two[0].id}`, `s1→${two[0].id}`, `s2→${two[1].id}`]);
    expect(screen.getAllByTestId('reader-link-row')).toHaveLength(2);
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
