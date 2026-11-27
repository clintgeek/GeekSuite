/**
 * BURN_REVIEW 2026-09-19: four separate, differently-wrong BP categorisers
 * were replaced with one shared `categorizeBP` (see bpUtils.js header). These
 * tests render each migrated surface with the headline dangerous reading —
 * 190/70, which the old BPLogList mislabelled "Stage 1" (the mildest
 * non-normal tier, in orange) because of a `systolic < 140 || diastolic < 90`
 * condition — and assert the surface shows what the shared function actually
 * says: Crisis.
 *
 * A test that only calls categorizeBP proves the function is right; it says
 * nothing about whether a given screen is still using its own (wrong) copy.
 * These tests render the real component tree so a regression to a local
 * reimplementation fails here, not just in bpUtils.test.js.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BPLogList from '../BPLogList.jsx';
import BPInsights from '../BPInsights.jsx';
import BPCategoryDistribution from '../BPCategoryDistribution.jsx';
import AddBPDialog from '../AddBPDialog.jsx';
import QuickAddBP from '../QuickAddBP.jsx';

const DANGEROUS_READING = { id: 'bp-danger', systolic: 190, diastolic: 70, log_date: '2026-06-01T00:00:00.000Z' };

describe('BPLogList — dangerous reading', () => {
  it('190/70 shows Crisis, not Stage 1', () => {
    render(<BPLogList logs={[DANGEROUS_READING]} onDelete={() => {}} />);

    // Rendered twice (mobile + desktop layouts), in plain words (review D-1).
    expect(screen.getAllByText('Very high (crisis)').length).toBeGreaterThan(0);
    expect(screen.queryByText(/stage 1/i)).toBeNull();
  });

  it('names the remove button after the reading, not a bare "delete"', () => {
    render(<BPLogList logs={[DANGEROUS_READING]} onDelete={() => {}} />);

    expect(
      screen.getAllByRole('button', { name: /remove the 190\/70 reading/i }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^(delete|remove)$/i })).toBeNull();
  });
});

describe('BPInsights — dangerous reading', () => {
  it('190/70 is reported as Crisis, not Stage 2 Hypertension', () => {
    render(<BPInsights bpLogs={[DANGEROUS_READING]} />);

    // In plain words (review D-1): the number, the tag with the medical name
    // in brackets, and one sentence.
    expect(screen.getByTestId('bp-now')).toHaveTextContent('190/70');
    expect(screen.getByText('Very high (crisis)')).toBeInTheDocument();
    expect(screen.getByTestId('bp-headline')).toHaveTextContent('No readings in the last 7 days. Your last one, Jun 1, was very high.');
    // A crisis-range reading keeps a clear, serious line.
    expect(screen.getByTestId('bp-guidance')).toHaveTextContent(/measure again.*call your doctor today.*call 911/);
    expect(screen.queryByText(/stage 2/i)).toBeNull();
    expect(screen.queryByText(/Hypertensive Crisis/)).toBeNull();
  });
});

describe('BPCategoryDistribution — dangerous reading', () => {
  it('190/70 is counted under Crisis, not Stage 2', () => {
    render(<BPCategoryDistribution bpLogs={[DANGEROUS_READING]} />);

    const rows = within(screen.getByTestId('bp-donut-legend')).getAllByTestId('bp-range-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Very high (crisis)1 reading');
    expect(screen.queryByText(/stage 2/i)).toBeNull();
  });
});

describe('AddBPDialog — live-typing category matches the saved row', () => {
  it('190/70 shows Crisis while typing, and never the non-standard High Normal band', async () => {
    const user = userEvent.setup();
    render(<AddBPDialog open onClose={() => {}} onAdd={async () => {}} />);

    await user.type(screen.getByLabelText(/systolic/i), '190');
    await user.type(screen.getByLabelText(/diastolic/i), '70');

    expect(screen.getByText('Very high (crisis)')).toBeInTheDocument();
    expect(screen.queryByText('High Normal')).toBeNull();
  });
});

describe('QuickAddBP — live-typing category matches the saved row', () => {
  it('190/70 shows Crisis while typing, and never the non-standard High Normal band', async () => {
    const user = userEvent.setup();
    render(<QuickAddBP onAdd={async () => {}} />);

    await user.type(screen.getByLabelText(/systolic/i), '190');
    await user.type(screen.getByLabelText(/diastolic/i), '70');

    expect(screen.getByText('Very high (crisis)')).toBeInTheDocument();
    expect(screen.queryByText('High Normal')).toBeNull();
  });
});
