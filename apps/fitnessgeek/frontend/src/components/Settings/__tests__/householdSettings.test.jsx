// The double-unwrap that hid the whole in-household branch.
//
// `settingsService.getHouseholdSettings()` returns the household object
// itself — `apiService.get` unwraps a single-key GraphQL response and the
// service returns that. The component unwrapped it a second time, so
// `householdData` was always `undefined`, `isInHousehold` always false, and
// every user only ever saw Create/Join.
//
// This test mocks the SERVICE at the shape it genuinely returns. Mocking it as
// `{ data: household }` would have made the buggy component pass and is the
// mistake that let this survive.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HouseholdSettings from '../HouseholdSettings';

// NAMED export, and `useToast` comes from @geeksuite/ui — matching how the
// component actually imports them. A mock whose shape does not match the real
// import silently leaves the component importing the real module.
vi.mock('../../../services/settingsService', () => ({
  settingsService: {
    getHouseholdSettings: vi.fn(),
    createHousehold: vi.fn(),
    joinHousehold: vi.fn(),
    leaveHousehold: vi.fn(),
    updateHouseholdSharing: vi.fn(),
  },
}));

vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { settingsService } = await import('../../../services/settingsService');

const HOUSEHOLD = {
  household_id: 'hh-123',
  display_name: 'Chef',
  share_food_logs: true,
  share_weight: false,
  share_meals: true,
  members: [{ user_id: 'u1', display_name: 'Chef', shares_food_logs: true, shares_meals: true }],
};

describe('HouseholdSettings — a member sees the household, not Create/Join', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the in-household branch when the service returns a household', async () => {
    settingsService.getHouseholdSettings.mockResolvedValue(HOUSEHOLD);

    render(<HouseholdSettings />);

    // The household code only appears on the in-household branch. Before the
    // fix this never rendered for anyone.
    await waitFor(() => expect(screen.getByText(/hh-123/i)).toBeInTheDocument());
  });

  it('names the icon-only copy button for screen readers', async () => {
    // The in-household branch was unreachable, so axe had never audited it;
    // the moment the fix above made it render, the mobile harness failed on
    // `button-name` (critical). getByRole with a name is the same query axe
    // is effectively making, and it fails if the aria-label is dropped.
    settingsService.getHouseholdSettings.mockResolvedValue(HOUSEHOLD);

    render(<HouseholdSettings />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copy household code/i })).toBeInTheDocument()
    );
  });

  it('still offers Create/Join when the user is genuinely in no household', async () => {
    // The fix must not invert the bug — no household is a real state.
    settingsService.getHouseholdSettings.mockResolvedValue(null);

    render(<HouseholdSettings />);

    await waitFor(() => expect(screen.queryByText(/hh-123/i)).not.toBeInTheDocument());
  });
});
