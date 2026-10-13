// The household log view said "No household members are sharing their food
// logs" for everyone, always.
//
// `fitnessGeekService.getHouseholdMembers()` resolves to the household itself
// and `getHouseholdMemberLogs()` to the log array — apiService unwraps the
// single GraphQL root field. The view read `.data.members` / `.data.logs` off
// those, which were always undefined. Mocked here at the true shapes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HouseholdLogView from '../HouseholdLogView';

vi.mock('../../../services/fitnessGeekService', () => ({
  fitnessGeekService: {
    getHouseholdMembers: vi.fn(),
    getHouseholdMemberLogs: vi.fn(),
  },
}));

const { fitnessGeekService } = await import('../../../services/fitnessGeekService');

const HOUSEHOLD = {
  household_id: '7D9169DE1A8F',
  display_name: 'Clint',
  members: [{ user_id: 'heather', display_name: 'Heather', shares_food_logs: true, shares_meals: true }],
};

const LOGS = [{
  id: 'l1',
  meal_type: 'breakfast',
  servings: 2,
  nutrition: { calories_per_serving: 150 },
  food_item_id: { id: 'f1', name: 'Overnight oats', nutrition: { calories_per_serving: 150 } },
}];

describe('HouseholdLogView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a sharing member’s logs, with calories', async () => {
    fitnessGeekService.getHouseholdMembers.mockResolvedValue(HOUSEHOLD);
    fitnessGeekService.getHouseholdMemberLogs.mockResolvedValue(LOGS);

    render(<HouseholdLogView open onClose={() => {}} currentDate="2026-10-13" onCopyMeal={() => {}} />);

    expect(await screen.findByText('Overnight oats')).toBeInTheDocument();
    expect(fitnessGeekService.getHouseholdMemberLogs).toHaveBeenCalledWith('heather', '2026-10-13');
    expect(screen.queryByText(/no household members are sharing/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);
  });

  it('says you are not in a household when you are not', async () => {
    fitnessGeekService.getHouseholdMembers.mockResolvedValue({ household_id: null, members: [] });

    render(<HouseholdLogView open onClose={() => {}} currentDate="2026-10-13" />);

    await waitFor(() => expect(screen.getByText(/not part of a household/i)).toBeInTheDocument());
  });
});
