import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResponsiveTable from '../../components/primitives/ResponsiveTable';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

const ROWS = [
  { id: 'k1', name: 'Alpha key', prefix: 'bg_abc1' },
  { id: 'k2', name: 'Beta key', prefix: 'bg_def2' },
];

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'prefix', label: 'Prefix' },
];

describe('ResponsiveTable (basegeek)', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('renders a real table at md+ with a header per column and a cell per row', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // desktop
    renderWithProviders(<ResponsiveTable columns={columns} rows={ROWS} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Alpha key' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Beta key' })).toBeInTheDocument();
  });

  it('renders one card per row below md, with no table role', () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile
    renderWithProviders(<ResponsiveTable columns={columns} rows={ROWS} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha key')).toBeInTheDocument();
    expect(screen.getByText('Beta key')).toBeInTheDocument();
  });

  it('renders a prominent card header from renderCardHeader on mobile', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(
      <ResponsiveTable
        columns={columns}
        rows={ROWS}
        renderCardHeader={(row) => <span>Key: {row.name}</span>}
      />
    );
    expect(screen.getByText('Key: Alpha key')).toBeInTheDocument();
  });

  it('renders trailing actions on desktop as an Actions column', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(
      <ResponsiveTable
        columns={columns}
        rows={ROWS}
        renderActions={(row) => <button>Revoke {row.name}</button>}
      />
    );
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Alpha key' })).toBeInTheDocument();
  });

  it('renders trailing actions in a footer row on mobile cards', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(
      <ResponsiveTable
        columns={columns}
        rows={ROWS}
        renderActions={(row) => <button>Revoke {row.name}</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Revoke Alpha key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Beta key' })).toBeInTheDocument();
  });

  it('shows a GeekEmptyState with the default message when there are no rows', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(<ResponsiveTable columns={columns} rows={[]} />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a GeekEmptyState with a custom emptyMessage', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(<ResponsiveTable columns={columns} rows={[]} emptyMessage="No keys yet" />);
    expect(screen.getByText('No keys yet')).toBeInTheDocument();
  });

  it('shows a GeekErrorState with a retry action when `error` is set, hiding the rows', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const onRetry = vi.fn();
    renderWithProviders(
      <ResponsiveTable columns={columns} rows={ROWS} error={new Error('boom')} onRetry={onRetry} />
    );
    expect(screen.getByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.queryByText('Alpha key')).not.toBeInTheDocument();
  });

  it('renders a custom errorTitle', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(
      <ResponsiveTable
        columns={columns}
        rows={ROWS}
        error={new Error('boom')}
        errorTitle="Couldn't load API keys"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("Couldn't load API keys")).toBeInTheDocument();
  });

  it('calls onRetry when the error state\'s retry action is clicked', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <ResponsiveTable columns={columns} rows={ROWS} error={new Error('boom')} onRetry={onRetry} />
    );
    await user.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('takes error precedence over an empty row set', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(<ResponsiveTable columns={columns} rows={[]} error={new Error('boom')} onRetry={vi.fn()} />);
    expect(screen.getByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });
});
