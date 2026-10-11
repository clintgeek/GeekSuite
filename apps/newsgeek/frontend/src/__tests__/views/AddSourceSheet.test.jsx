/**
 * The Add a source sheet's state machine (plan "Reader-added sources"):
 * idle → discovering → preview → added; no feed; already here (discovery's
 * existingSourceId, or create's DUPLICATE_FEED) → turn it on; rate limited;
 * the SSRF guard's message shown as returned.
 */
import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { CREATE_NEWS_SOURCE, SET_NEWS_SOURCE_DEFAULT_ON, SET_NEWS_SOURCE_ON } from '../../graphql/mutations';
import { GET_NEWS_PLACES } from '../../graphql/queries';
import AddSourceSheet, { ADDED_EVERYONE_LINE, ADDED_LINE, ADD_RATE_LIMITED_LINE } from '../../views/AddSourceSheet';
import { DiscoverError, RATE_LIMITED_LINE, discoverSource } from '../../api/discover';
import { place, source } from '../fixtures';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/discover', async (importActual) => {
  const actual = await importActual();
  return { ...actual, discoverSource: vi.fn() };
});

const PLACES = [place('p-magnolia', 'Magnolia', 'city'), place('p-eldorado', 'El Dorado', 'city'), place('p-columbia', 'Columbia County')];
PLACES[0].slug = 'magnolia';
PLACES[1].slug = 'el-dorado';
PLACES[2].slug = 'columbia-county';
const placesMock = { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: PLACES } }, maxUsageCount: 10 };

const FOUND = {
  ok: true,
  site: { name: 'Magnolia Reporter', homepage: 'https://www.magnoliareporter.com/' },
  feeds: [
    { url: 'https://www.magnoliareporter.com/search/?f=rss&t=article&l=50', format: 'rss', items: 50, newest: '2026-10-10T10:00:00.000Z', sampleTitles: ['Council sets budget hearing', 'Panthers win homecoming', 'Library extends hours'] },
    { url: 'https://www.magnoliareporter.com/feed/', format: 'atom', items: 10, newest: '2026-10-09T10:00:00.000Z', sampleTitles: ['Older A', 'Older B', 'Older C'] },
  ],
  paywall: { level: 'unknown', evidence: null },
  suggest: { name: 'Magnolia Reporter', kind: 'journalism', sections: ['local'], placeSlugs: ['magnolia', 'el-dorado'] },
  existingSourceId: null,
  message: null,
};

const created = (overrides = {}) => source('new1', { name: 'The Magnolia Reporter', defaultOn: false, onForMe: true, addedByMe: true, canEdit: true, ...overrides });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSheet({ mocks = [], sources = [], isAdmin = false, onClose = vi.fn(), initialUrl = '', autoRun = false } = {}) {
  renderWithProviders(<AddSourceSheet open onClose={onClose} sources={sources} isAdmin={isAdmin} initialUrl={initialUrl} autoRun={autoRun} />, {
    mocks: [placesMock, ...mocks],
  });
  return { onClose };
}

const linkField = () => screen.getByLabelText(/link to the site or a story/i);
async function findFeedFor(text) {
  await userEvent.type(linkField(), text);
  await userEvent.click(screen.getByRole('button', { name: 'Find feed' }));
}

beforeEach(() => {
  discoverSource.mockReset();
});

describe('Add a source sheet', () => {
  it('idle → discovering → preview → added, and newsCreateSource gets the edited values', async () => {
    const d = deferred();
    discoverSource.mockReturnValue(d.promise);
    const createdWith = vi.fn();
    const createMock = {
      request: { query: CREATE_NEWS_SOURCE },
      variableMatcher: () => true,
      result: (vars) => {
        createdWith(vars);
        return { data: { newsCreateSource: created() } };
      },
    };
    const { onClose } = renderSheet({ mocks: [createMock] });

    expect(screen.getByTestId('add-source-sheet')).toHaveAttribute('data-phase', 'idle');
    expect(linkField()).toHaveAttribute('inputmode', 'url');
    await findFeedFor('magnoliareporter.com');

    // A bare domain is discovered as https://.
    expect(discoverSource).toHaveBeenCalledWith('https://magnoliareporter.com/', expect.objectContaining({ signal: expect.anything() }));
    expect(screen.getByTestId('discovering')).toHaveTextContent('Looking for a feed… ~5 s');
    expect(screen.getByRole('button', { name: 'Looking…' })).toBeDisabled();

    await act(async () => d.resolve(FOUND));
    const preview = await screen.findByTestId('add-preview');
    expect(within(preview).getByLabelText('Name')).toHaveValue('Magnolia Reporter');
    expect(within(screen.getByTestId('sample-headlines')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Council sets budget hearing',
      'Panthers win homecoming',
      'Library extends hours',
    ]);
    expect(screen.getByTestId('paywall-verdict')).toHaveTextContent(/Unknown/);
    // Suggested places resolved from slugs.
    expect(await within(preview).findByText('Magnolia')).toBeInTheDocument();
    expect(within(preview).getByText('El Dorado')).toBeInTheDocument();
    // Readers never see "On for everyone".
    expect(screen.queryByLabelText('On for everyone')).toBeNull();

    // Edit: the name, the second feed, add State, pick Official.
    const name = within(preview).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'The Magnolia Reporter');
    await userEvent.click(screen.getByRole('radio', { name: /magnoliareporter\.com\/feed\// }));
    expect(within(screen.getByTestId('sample-headlines')).getAllByRole('listitem')[0]).toHaveTextContent('Older A');
    await userEvent.click(screen.getByRole('button', { name: 'State' }));
    await userEvent.click(screen.getByRole('button', { name: 'Official' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(ADDED_LINE)).toBeInTheDocument();
    expect(createdWith).toHaveBeenCalledTimes(1);
    expect(createdWith.mock.calls[0][0]).toEqual({
      input: {
        name: 'The Magnolia Reporter',
        homepage: 'https://www.magnoliareporter.com/',
        kind: 'official',
        sections: ['local', 'state'],
        placeIds: ['p-magnolia', 'p-eldorado'],
        feeds: [{ url: 'https://www.magnoliareporter.com/feed/', format: 'atom' }],
        paywall: 'none',
      },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('no feed: says so plainly, and "Try another link" goes back to the link field', async () => {
    discoverSource.mockResolvedValue({ ok: false, message: 'No feed found — this site only publishes web pages', feeds: [] });
    renderSheet();
    await findFeedFor('https://example.org/about');
    expect(await screen.findByTestId('add-nofeed')).toHaveTextContent('No feed found — this site only publishes web pages');
    await userEvent.click(screen.getByRole('button', { name: 'Try another link' }));
    expect(screen.getByTestId('add-source-sheet')).toHaveAttribute('data-phase', 'idle');
    expect(linkField()).toHaveValue('https://example.org/about');
  });

  it('already here (existingSourceId), off for me: "Turn it on" calls newsSetSourceOn(id, true)', async () => {
    discoverSource.mockResolvedValue({ ...FOUND, existingSourceId: 's9' });
    const turnedOn = vi.fn(() => ({ data: { newsSetSourceOn: { __typename: 'NewsSource', id: 's9', onForMe: true, defaultOn: false } } }));
    const { onClose } = renderSheet({
      sources: [source('s9', { name: 'Magnolia Reporter', onForMe: false, defaultOn: false })],
      mocks: [{ request: { query: SET_NEWS_SOURCE_ON, variables: { id: 's9', on: true } }, result: turnedOn }],
    });
    await findFeedFor('magnoliareporter.com');
    const here = await screen.findByTestId('add-existing');
    expect(here).toHaveTextContent('Already here');
    expect(here).toHaveTextContent('Magnolia Reporter');
    await userEvent.click(screen.getByRole('button', { name: 'Turn it on' }));
    await waitFor(() => expect(turnedOn).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Turned on — it’s in your paper.')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('already here and already on for me: says so, no "Turn it on"', async () => {
    discoverSource.mockResolvedValue({ ...FOUND, existingSourceId: 's9' });
    renderSheet({ sources: [source('s9', { name: 'Magnolia Reporter', onForMe: true })] });
    await findFeedFor('magnoliareporter.com');
    expect(await screen.findByTestId('add-existing')).toHaveTextContent('It’s already in your paper.');
    expect(screen.queryByRole('button', { name: 'Turn it on' })).toBeNull();
  });

  it('DUPLICATE_FEED from newsCreateSource → "Already here" for extensions.sourceId, then Turn it on', async () => {
    discoverSource.mockResolvedValue(FOUND);
    const turnedOn = vi.fn(() => ({ data: { newsSetSourceOn: { __typename: 'NewsSource', id: 's7', onForMe: true, defaultOn: true } } }));
    renderSheet({
      sources: [source('s7', { name: 'Magnolia Reporter (old)', onForMe: false, defaultOn: true })],
      mocks: [
        {
          request: { query: CREATE_NEWS_SOURCE },
          variableMatcher: () => true,
          result: { errors: [new GraphQLError('That feed is already a source', { extensions: { code: 'DUPLICATE_FEED', sourceId: 's7' } })] },
        },
        { request: { query: SET_NEWS_SOURCE_ON, variables: { id: 's7', on: true } }, result: turnedOn },
      ],
    });
    await findFeedFor('magnoliareporter.com');
    await screen.findByTestId('add-preview');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByTestId('add-existing')).toHaveTextContent('Magnolia Reporter (old)');
    await userEvent.click(screen.getByRole('button', { name: 'Turn it on' }));
    await waitFor(() => expect(turnedOn).toHaveBeenCalledTimes(1));
  });

  it('RATE_LIMITED from newsCreateSource keeps the preview and says why', async () => {
    discoverSource.mockResolvedValue(FOUND);
    renderSheet({
      mocks: [
        {
          request: { query: CREATE_NEWS_SOURCE },
          variableMatcher: () => true,
          result: { errors: [new GraphQLError('limit', { extensions: { code: 'RATE_LIMITED' } })] },
        },
      ],
    });
    await findFeedFor('magnoliareporter.com');
    await screen.findByTestId('add-preview');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(ADD_RATE_LIMITED_LINE)).toBeInTheDocument();
    expect(screen.getByTestId('add-preview')).toBeInTheDocument();
  });

  it('discovery rate-limited: the friendly line', async () => {
    discoverSource.mockRejectedValue(new DiscoverError(RATE_LIMITED_LINE, { code: 'RATE_LIMITED', status: 429 }));
    renderSheet();
    await findFeedFor('magnoliareporter.com');
    expect(await screen.findByTestId('add-error')).toHaveTextContent(RATE_LIMITED_LINE);
    expect(screen.getByRole('button', { name: 'Try another link' })).toBeInTheDocument();
  });

  it('an address the SSRF guard refuses: its message, as returned', async () => {
    discoverSource.mockRejectedValue(new DiscoverError('That address isn’t on the public internet.', { code: 'UNSAFE_URL', status: 400 }));
    renderSheet();
    await findFeedFor('http://192.168.1.10/');
    expect(await screen.findByTestId('add-error')).toHaveTextContent('That address isn’t on the public internet.');
  });

  it('something that is not a link never reaches discovery', async () => {
    renderSheet();
    await findFeedFor('not a link');
    expect(await screen.findByText(/doesn’t look like a link/)).toBeInTheDocument();
    expect(discoverSource).not.toHaveBeenCalled();
  });

  it('an admin sees "On for everyone"; on, it is set after the create', async () => {
    discoverSource.mockResolvedValue(FOUND);
    const order = [];
    renderSheet({
      isAdmin: true,
      mocks: [
        {
          request: { query: CREATE_NEWS_SOURCE },
          variableMatcher: () => true,
          result: () => {
            order.push('create');
            return { data: { newsCreateSource: created() } };
          },
        },
        {
          request: { query: SET_NEWS_SOURCE_DEFAULT_ON, variables: { id: 'new1', on: true } },
          result: () => {
            order.push('defaultOn');
            return { data: { newsSetSourceDefaultOn: { __typename: 'NewsSource', id: 'new1', onForMe: true, defaultOn: true } } };
          },
        },
      ],
    });
    await findFeedFor('magnoliareporter.com');
    await screen.findByTestId('add-preview');
    await userEvent.click(screen.getByRole('switch', { name: 'On for everyone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(ADDED_EVERYONE_LINE)).toBeInTheDocument();
    expect(order).toEqual(['create', 'defaultOn']);
  });

  it('opened from a suggestion: prefilled with https://<domain> and discovery runs at once', async () => {
    discoverSource.mockResolvedValue(FOUND);
    renderSheet({ initialUrl: 'https://magnoliareporter.com', autoRun: true });
    expect(await screen.findByTestId('add-preview')).toBeInTheDocument();
    expect(discoverSource).toHaveBeenCalledWith('https://magnoliareporter.com/', expect.anything());
  });
});
