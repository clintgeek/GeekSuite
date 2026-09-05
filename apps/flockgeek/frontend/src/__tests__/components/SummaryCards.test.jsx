import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import SummaryCards from '../../components/home/SummaryCards';
import { SUMMARY_STATS } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('SummaryCards', () => {
  it('renders each stat value, deriving the hatch count from recentHatches', () => {
    renderWithProviders(<SummaryCards stats={SUMMARY_STATS} />);

    expect(screen.getByText('Total Birds')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    expect(screen.getByText('Laying Hens')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    expect(screen.getByText('Eggs / day')).toBeInTheDocument();
    expect(screen.getByText('9.6')).toBeInTheDocument();

    expect(screen.getByText('Hatches')).toBeInTheDocument();
    // recentHatches has 3 entries in the fixture, not the raw hatchCount field.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an em dash for a missing stat with no stats loaded', () => {
    renderWithProviders(<SummaryCards stats={undefined} />);
    // birdsCount, layingHensCount, groupsCount, avgDailyEggs all missing;
    // hatchCount resolves to 0 (an empty recentHatches list), so 4 dashes.
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
