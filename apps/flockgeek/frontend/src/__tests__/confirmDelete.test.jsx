// UX review 2026-11-18, FlockGeek 8: every delete was the browser's own
// `window.confirm` (with the site address in it, in an installed PWA). The
// gateway has no restore for a soft-deleted flock record, so a delete cannot
// be undone from the app and, under the suite rule, asks first — in the
// ledger's own themed dialog. Also: Groups said "1 birds".

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createFlockTheme } from '../theme/theme';
import GroupsPage from '../pages/GroupsPage';
import { GET_FLOCK_GROUPS, GET_GROUP_MEMBERSHIPS } from '../graphql/queries';
import { DELETE_ENTITY } from '../graphql/mutations';
import { useConfirmDelete } from '../components/primitives/ConfirmDelete';
import { renderWithProviders } from './testUtils';

const theme = createFlockTheme('dark');

const group = {
  id: 'g1', name: 'Layers', purpose: 'layer_flock', type: null,
  startDate: '2026-01-01T00:00:00.000Z', endDate: null, description: null, notes: null,
};
const membership = {
  id: 'm1', groupId: 'g1', birdId: 'b1', joinedAt: null, leftAt: null, role: null,
  bird: { id: 'b1', name: 'Henrietta', tagId: 'NC-001', species: 'chicken', breed: null, sex: 'hen' },
};

function renderGroups(deleted) {
  const mocks = [
    { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [group] } } },
    { request: { query: GET_GROUP_MEMBERSHIPS, variables: { activeOnly: true } }, result: { data: { groupMemberships: [membership] } } },
    {
      request: { query: DELETE_ENTITY, variables: { type: 'group', id: 'g1' } },
      result: () => { deleted(); return { data: { deleteFlockEntity: true } }; },
    },
    { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [] } } },
  ];
  return render(
    <MockedProvider mocks={mocks}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <GroupsPage />
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Deleting a group', () => {
  it('asks in a themed dialog, never window.confirm, and deletes only on Delete', async () => {
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const deleted = vi.fn();
    renderGroups(deleted);

    await user.click(await screen.findByRole('button', { name: 'Delete Layers' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this group?' });
    expect(within(dialog).getByText(/Layers will be removed/)).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(deleted).toHaveBeenCalledTimes(1));
    expect(nativeConfirm).not.toHaveBeenCalled();
  }, 30000);

  it('"Keep it" leaves the group alone', async () => {
    const user = userEvent.setup();
    const deleted = vi.fn();
    renderGroups(deleted);

    await user.click(await screen.findByRole('button', { name: 'Delete Layers' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this group?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByText('Layers')).toBeInTheDocument();
  }, 30000);

  it('counts one bird as "1 bird"', async () => {
    renderGroups(vi.fn());
    expect(await screen.findByText('1 bird')).toBeInTheDocument();
  }, 30000);
});

// Review 2026-11-20: the pages' delete mutations carry an onError toast, so
// Apollo resolves a failed delete with `errors` instead of throwing. Birds
// collapsed the open row and closed the editor anyway, throwing away the
// edits for a delete that never happened. And a delete removes its own
// trigger, so focus fell to the page body.
function DeleteHarness({ onConfirm, onDeleted }) {
  const [confirmDelete, confirmDialog] = useConfirmDelete();
  return (
    <>
      <h3 data-geek-topbar="title">Birds</h3>
      <button type="button" onClick={() => confirmDelete({ title: 'Delete this bird?', body: 'Gone.', onConfirm, onDeleted })}>
        Delete Henrietta
      </button>
      {confirmDialog}
    </>
  );
}

describe('useConfirmDelete', () => {
  it('runs the page tidy-up only when the delete worked', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    renderWithProviders(
      <DeleteHarness onConfirm={() => Promise.resolve({ data: null, errors: [new Error('nope')] })} onDeleted={onDeleted} />
    );
    await user.click(screen.getByRole('button', { name: 'Delete Henrietta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this bird?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  }, 30000);

  it('treats a thrown delete as failed too', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteHarness onConfirm={() => Promise.reject(new Error('offline'))} onDeleted={onDeleted} />);
    await user.click(screen.getByRole('button', { name: 'Delete Henrietta' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  }, 30000);

  it('after a delete, tidies up and puts focus on the list heading, not the body', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteHarness onConfirm={() => Promise.resolve({ data: { deleteFlockEntity: true } })} onDeleted={onDeleted} />);
    await user.click(screen.getByRole('button', { name: 'Delete Henrietta' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDeleted).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('Birds')));
  }, 30000);
});
