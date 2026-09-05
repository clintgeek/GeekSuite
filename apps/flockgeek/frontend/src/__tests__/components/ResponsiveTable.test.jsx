import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from '@mui/material';
import ResponsiveTable from '../../components/primitives/ResponsiveTable';
import { BIRDS } from '../fixtures';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

const columns = [
  { key: 'tagId', label: 'Tag ID', primary: true },
  { key: 'name', label: 'Name' },
  { key: 'breed', label: 'Breed' },
  { key: 'status', label: 'Status' },
];

function baseProps(overrides = {}) {
  return {
    columns,
    rows: BIRDS.slice(0, 5),
    getRowId: (row) => row.id,
    sortBy: 'tagId',
    sortOrder: 'asc',
    onSort: vi.fn(),
    rowActions: (_row) => [
      { id: 'edit', label: 'Edit bird', onClick: overrides.onEdit || vi.fn() },
      { id: 'retire', label: 'Retire', onClick: overrides.onRetire || vi.fn() },
    ],
    page: 0,
    rowsPerPage: 5,
    count: BIRDS.length,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

describe('ResponsiveTable', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('renders a real table at md+', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // desktop
    renderWithProviders(<ResponsiveTable {...baseProps()} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tag ID' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Henrietta' })).toBeInTheDocument();
  });

  it('renders one card per row below md, titled by the primary column', () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile
    renderWithProviders(<ResponsiveTable {...baseProps()} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The primary column (Tag ID) titles the card.
    expect(screen.getByText('NC-001')).toBeInTheDocument();
    expect(screen.getByText('Henrietta')).toBeInTheDocument();
  });

  it('opens the row action sheet and fires the chosen action', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithProviders(<ResponsiveTable {...baseProps({ onEdit })} />);

    await user.click(screen.getByRole('button', { name: 'Actions for NC-001' }));
    const editButton = await screen.findByRole('button', { name: 'Edit bird' });
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ tagId: 'NC-001' }));
  });

  it('opens the sort sheet and reports the chosen column', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    const user = userEvent.setup();
    const onSort = vi.fn();
    renderWithProviders(<ResponsiveTable {...baseProps({ onSort })} />);

    await user.click(screen.getByRole('button', { name: /tag id|sort/i }));
    const nameOption = await screen.findByRole('button', { name: 'Name' });
    await user.click(nameOption);

    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('shows the active filter count on the Filters pill', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(
      <ResponsiveTable
        {...baseProps()}
        filters={<TextField label="Breed" size="small" />}
        filterCount={2}
      />
    );
    expect(screen.getByRole('button', { name: 'Filters · 2' })).toBeInTheDocument();
  });

  it('pages forward and back with prev/next, disabling at the ends', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderWithProviders(
      <ResponsiveTable {...baseProps({ page: 0, rowsPerPage: 5, count: 12, onPageChange })} />
    );

    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(next);
    expect(onPageChange).toHaveBeenCalledWith(null, 1);
  });
});
