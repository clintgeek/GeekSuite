/**
 * "Skip URLs matching" (NewsSource.pathExclude, feed hygiene): the admin's
 * list of path patterns in the source form, validated like the gateway
 * validates it; sent only by an admin and only when it changed. A reader —
 * even the source's adder — never sees the section and never sends the
 * field (the gateway answers ADMIN_REQUIRED). The source page lists the
 * patterns read-only.
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UPDATE_NEWS_SOURCE } from '../../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCE } from '../../graphql/queries';
import SourceDetailView from '../../views/SourceDetailView';
import { formFromSource, inputFromForm } from '../../utils/sources';
import { place, source, viewerMock } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const SAVED = ['^/online_features/'];
const src = (o = {}) => source('s1', { name: 'The Arkadelphian', canEdit: true, pathExclude: SAVED, ...o });
const detailMock = (s) => ({ request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } }, result: { data: { newsSource: s } } });
const placesMock = { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [place('clark', 'Clark County')] } }, maxUsageCount: 5 };

/** Records every newsUpdateSource payload; answers with the source as sent. */
function updateSpy(s) {
  const calls = [];
  const mock = {
    request: { query: UPDATE_NEWS_SOURCE },
    variableMatcher: (vars) => {
      calls.push(vars);
      return true;
    },
    result: () => ({ data: { newsUpdateSource: { ...s, pathExclude: calls.at(-1)?.input?.pathExclude ?? s.pathExclude } } }),
    maxUsageCount: 5,
  };
  return { calls, mock };
}

async function openEdit(isAdmin, s, extra = []) {
  renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(isAdmin), detailMock(s), placesMock, ...extra], initialEntries: ['/sources/s1'], path: '/sources/:id' });
  await screen.findByRole('heading', { level: 1, name: 'The Arkadelphian' });
  await new Promise((r) => setTimeout(r, 20)); // the viewer answer
  await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  return screen.findByRole('dialog', { name: 'Edit The Arkadelphian' });
}

describe('Skip URLs matching — admin', () => {
  it('lists the saved patterns with an example, a 44px remove per pattern named for it, and add', async () => {
    const dialog = await openEdit(true, src());
    const group = within(dialog).getByRole('group', { name: 'Skip URLs matching' });
    expect(within(group).getByLabelText('Skip pattern 1')).toHaveValue('^/online_features/');
    expect(group).toHaveTextContent('^/online_features/');
    expect(within(group).getByRole('button', { name: 'Remove pattern ^/online_features/' })).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('button', { name: 'Add another pattern' }));
    expect(within(group).getByLabelText('Skip pattern 2')).toHaveValue('');
  });

  it('a pattern that does not compile is marked where it is, and Save refuses with a message', async () => {
    const s = src();
    const { calls, mock } = updateSpy(s);
    const dialog = await openEdit(true, s, [mock]);
    const group = within(dialog).getByRole('group', { name: 'Skip URLs matching' });
    await userEvent.click(within(group).getByRole('button', { name: 'Add another pattern' }));
    const row = within(group).getByLabelText('Skip pattern 2');
    // Pasted, not typed: a keystroke per character is slow on a loaded box.
    await userEvent.click(row);
    await userEvent.paste('^/(press');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(group).findByText(/not a valid pattern/i)).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText(/Fix the patterns under “Skip URLs matching”/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Edit The Arkadelphian' })).toBeInTheDocument();
  });

  it('a valid edit sends the whole new list as pathExclude (trimmed, blanks dropped)', async () => {
    const s = src();
    const { calls, mock } = updateSpy(s);
    const dialog = await openEdit(true, s, [mock]);
    const group = within(dialog).getByRole('group', { name: 'Skip URLs matching' });
    await userEvent.click(within(group).getByRole('button', { name: 'Add another pattern' }));
    await userEvent.click(within(group).getByLabelText('Skip pattern 2'));
    await userEvent.paste('  ^/press_releases/ ');
    await userEvent.click(within(group).getByRole('button', { name: 'Add another pattern' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ id: 's1', input: { ...inputFromForm(formFromSource(s)), pathExclude: ['^/online_features/', '^/press_releases/'] } });
    expect(await screen.findByText('Source saved.')).toBeInTheDocument();
  });

  it('removing the last pattern sends an empty list', async () => {
    const s = src();
    const { calls, mock } = updateSpy(s);
    const dialog = await openEdit(true, s, [mock]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove pattern ^/online_features/' }));
    expect(within(dialog).queryByLabelText('Skip pattern 1')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].input.pathExclude).toEqual([]);
  });

  it('an admin who left the patterns alone does not send the field', async () => {
    const s = src();
    const { calls, mock } = updateSpy(s);
    const dialog = await openEdit(true, s, [mock]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].input).not.toHaveProperty('pathExclude');
  });
});

describe('Skip URLs matching — a reader', () => {
  it('the adder (not admin) never sees the section and never sends pathExclude', async () => {
    const s = src({ addedByMe: true });
    const { calls, mock } = updateSpy(s);
    const dialog = await openEdit(false, s, [mock]);
    expect(within(dialog).queryByRole('group', { name: 'Skip URLs matching' })).toBeNull();
    expect(within(dialog).queryByLabelText(/Skip pattern/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].input).not.toHaveProperty('pathExclude');
  });

  it('the source page lists the patterns read-only for anyone when there are some, and leaves the line out when there are none', async () => {
    renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(false), detailMock(src({ canEdit: false }))], initialEntries: ['/sources/s1'], path: '/sources/:id' });
    const list = await screen.findByTestId('detail-path-rules');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(SAVED);
    expect(screen.getByText('Skips URLs matching')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('…and no line at all for a reader when the source has none', async () => {
    renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(false), detailMock(src({ canEdit: false, pathExclude: [] }))], initialEntries: ['/sources/s1'], path: '/sources/:id' });
    await screen.findByRole('heading', { level: 1, name: 'The Arkadelphian' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Skips URLs matching')).toBeNull();
  });
});
