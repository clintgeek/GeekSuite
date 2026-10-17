// Join/Create reported failure on success, and hid every real failure.
//
// `settingsService.joinHousehold()` resolves to the bare mutation payload
// (`{ household_id }`) — apiService unwraps the single GraphQL root field.
// The component read `response.data.message` off it, threw a TypeError AFTER
// the server had already joined, and the catch toasted "Failed to join".
// The catch itself read `err.response.data.error.message`, an Axios shape an
// ApolloError never has, so "Household not found" never reached the person.
//
// Services are mocked at the shape they genuinely resolve to — mocking them
// as `{ data: … }` is how the original bug passed review.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HouseholdSettings from '../HouseholdSettings';

vi.mock('../../../services/settingsService', () => ({
  settingsService: {
    getHouseholdSettings: vi.fn(),
    createHousehold: vi.fn(),
    joinHousehold: vi.fn(),
    leaveHousehold: vi.fn(),
    updateHouseholdSettings: vi.fn(),
  },
}));

const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));

const { settingsService } = await import('../../../services/settingsService');

const fillAndJoin = async () => {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  await user.click(await screen.findByRole('button', { name: /join a household/i }));
  await user.type(screen.getByLabelText(/household code/i), '7d9169de1a8f');
  await user.type(screen.getByLabelText(/your name/i), 'Heather');
  await user.click(screen.getByRole('button', { name: /^join$/i }));
};

describe('HouseholdSettings — join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsService.getHouseholdSettings.mockResolvedValue(null);
  });

  it('a successful join says so, and shows the household', async () => {
    settingsService.joinHousehold.mockResolvedValue({ household_id: '7D9169DE1A8F' });
    render(<HouseholdSettings />);
    await fillAndJoin();
    settingsService.getHouseholdSettings.mockResolvedValue({
      household_id: '7D9169DE1A8F', display_name: 'Heather', members: [],
    });

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Joined the household', { tone: 'success' }));
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/failed/i), expect.anything());
    expect(settingsService.joinHousehold).toHaveBeenCalledWith('7D9169DE1A8F', 'Heather');
  });

  it('a refused join shows the server’s reason, not a generic failure', async () => {
    settingsService.joinHousehold.mockRejectedValue(
      Object.assign(new Error('Household not found'), { graphQLErrors: [{ message: 'Household not found' }] })
    );
    render(<HouseholdSettings />);
    await fillAndJoin();

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Household not found', { tone: 'error' }));
  });
});

describe('HouseholdSettings — the household name', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the name and saves a rename when she leaves the box — no Save button (IA-3)', async () => {
    settingsService.getHouseholdSettings.mockResolvedValue({
      household_id: '7D9169DE1A8F', name: 'Crocker', display_name: 'Clint', members: [],
    });
    settingsService.updateHouseholdSettings.mockResolvedValue({ household_id: '7D9169DE1A8F' });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<HouseholdSettings />);

    const field = await screen.findByLabelText(/household name/i);
    expect(field).toHaveValue('Crocker');
    await user.clear(field);
    await user.type(field, 'The Crockers');
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    await user.tab();

    await waitFor(() => expect(settingsService.updateHouseholdSettings).toHaveBeenCalledWith({ name: 'The Crockers' }));
    expect(notify).toHaveBeenCalledWith('Saved', expect.objectContaining({ tone: 'success' }));
  });

  it('a new household is created with its name', async () => {
    settingsService.getHouseholdSettings.mockResolvedValue(null);
    settingsService.createHousehold.mockResolvedValue({ household_id: 'NEW123456789', name: 'Crocker' });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<HouseholdSettings />);

    await user.click(await screen.findByRole('button', { name: /create a household/i }));
    await user.type(screen.getByLabelText(/household name/i), 'Crocker');
    await user.type(screen.getByLabelText(/your name/i), 'Clint');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(settingsService.createHousehold).toHaveBeenCalledWith('Clint', 'Crocker'));
  });
});
