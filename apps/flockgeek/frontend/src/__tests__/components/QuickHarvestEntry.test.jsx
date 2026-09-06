import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickHarvestEntry from '../../components/QuickHarvestEntry';
import { renderWithProviders } from '../testUtils';

// QuickHarvestEntry talks to Apollo directly (useQuery for recent harvests,
// useMutation to record one). A component test wants to control that traffic
// itself rather than match real GraphQL documents, so the hooks are replaced
// with plain spies; `gql`/everything else in the module stays real.
const { mockRecordEggProduction } = vi.hoisted(() => ({
  mockRecordEggProduction: vi.fn(),
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuery: () => ({ data: { eggProductions: [] }, refetch: vi.fn() }),
    useMutation: () => [mockRecordEggProduction, { loading: false }],
  };
});

describe('QuickHarvestEntry', () => {
  beforeEach(() => {
    mockRecordEggProduction.mockClear();
  });

  it('changes the egg count with the +/- steppers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuickHarvestEntry locations={[]} />);
    const countInput = screen.getAllByRole('spinbutton')[0];
    expect(countInput).toHaveValue(0);

    await user.click(screen.getByRole('button', { name: 'Add one egg' }));
    await user.click(screen.getByRole('button', { name: 'Add one egg' }));
    await user.click(screen.getByRole('button', { name: 'Add one egg' }));
    await waitFor(() => expect(countInput).toHaveValue(3));

    await user.click(screen.getByRole('button', { name: 'Remove one egg' }));
    await waitFor(() => expect(countInput).toHaveValue(2));
    // Three sequential real pointer interactions plus two waitFor polls comfortably
    // clear vitest's 5s default under normal load, but not under the heavy
    // concurrent load this box sometimes carries; give this one room.
  }, 10000);

  it('shows the ÷ days helper text', () => {
    renderWithProviders(<QuickHarvestEntry locations={[]} />);
    expect(
      screen.getByText(/÷ days is how many days this harvest covers/i)
    ).toBeInTheDocument();
  });

  // a11y: both number inputs are visually a stepper/adornment pair with no
  // room for a floating MUI label, so they carry an aria-label instead — but
  // the days field used to pass it as a bare `aria-label` prop on `TextField`,
  // which MUI drops onto the outer root div rather than the actual `<input>`,
  // leaving the input itself unnamed to a screen reader (axe: `label`).
  it('names the egg-count and days-observed inputs for assistive tech', () => {
    renderWithProviders(<QuickHarvestEntry locations={[]} />);
    expect(screen.getByRole('spinbutton', { name: 'Eggs collected' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Days observed' })).toBeInTheDocument();
  });

  // a11y: the Location/Pen `Select` had a visible `InputLabel` but no
  // `labelId`/`id` pairing, so the rendered `role="combobox"` div had no
  // accessible name at all (axe: `aria-input-field-name`).
  it('names the Location / Pen select for assistive tech', () => {
    const locations = [
      { id: 'loc-1', name: 'North Coop' },
      { id: 'loc-2', name: 'South Run' },
    ];
    renderWithProviders(<QuickHarvestEntry locations={locations} />);
    expect(screen.getByRole('combobox', { name: 'Location / Pen' })).toBeInTheDocument();
  });

  it('sets the count from a quick-add chip', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuickHarvestEntry locations={[]} />);
    const chip = screen.getByRole('button', { name: '6' });

    await user.click(chip);

    await waitFor(() => expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(6));
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('submits the mutation with the harvest payload', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuickHarvestEntry locations={[]} />);

    await user.click(screen.getByRole('button', { name: '4' }));
    const submit = await screen.findByRole('button', { name: /log 4 eggs/i });
    await user.click(submit);

    expect(mockRecordEggProduction).toHaveBeenCalledTimes(1);
    const [{ variables }] = mockRecordEggProduction.mock.calls[0];
    expect(variables).toEqual(
      expect.objectContaining({
        eggsCount: 4,
        daysObserved: 1,
      })
    );
    expect(typeof variables.date).toBe('string');

    // Going-over 2026-09-05: this used to assert `source: 'manual'`, which
    // made the test agree with a payload the server never saw.
    // `RECORD_EGG_PRODUCTION` declares no `$source` variable and the gateway's
    // `recordEggProduction` takes no `source` argument, so GraphQL dropped the
    // key in silence and the field was never set on a single record. The
    // component no longer sends it; a mutation carrying a variable its own
    // document does not declare is the bug, not the contract.
    expect(variables).not.toHaveProperty('source');
  }, 10000);
});
