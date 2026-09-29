import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import OnboardingChecklist, { checklistSteps, HIDE_KEY, isNewIsh, LABELS_KEY } from '../../components/OnboardingChecklist';
import { renderWithProviders } from '../testUtils';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage */
  }
});

describe('isNewIsh', () => {
  it('fewer than 10 things, or fewer than 2 locations', () => {
    expect(isNewIsh({ locationsCount: 5, itemsCount: 0 })).toBe(true); // prod's actual shape
    expect(isNewIsh({ locationsCount: 1, itemsCount: 40 })).toBe(true);
    expect(isNewIsh({ locationsCount: 4, itemsCount: 16 })).toBe(false);
    expect(isNewIsh({ locationsCount: 2, itemsCount: 10 })).toBe(false);
  });
});

describe('checklistSteps', () => {
  it('each step is done by its own rule, independent of the others', () => {
    const steps = checklistSteps({ locationsCount: 1, itemsCount: 3, missingIdPlate: 2, labelsAnswer: null });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['rooms', false],
      ['walk', false],
      ['id-plate', false],
      ['labels', false],
    ]);
  });

  it('rooms done at 2 locations, walk done at 5 things', () => {
    expect(checklistSteps({ locationsCount: 2, itemsCount: 5 }).slice(0, 2).map((s) => s.done)).toEqual([true, true]);
    expect(checklistSteps({ locationsCount: 1, itemsCount: 4 }).slice(0, 2).map((s) => s.done)).toEqual([false, false]);
  });

  it('id-plate done when there are items and missingIdPlate is 0', () => {
    expect(checklistSteps({ itemsCount: 3, missingIdPlate: 0 })[2].done).toBe(true);
    expect(checklistSteps({ itemsCount: 3, missingIdPlate: 1 })[2].done).toBe(false);
    // An empty inventory has nothing missing, but nothing photographed either.
    expect(checklistSteps({ itemsCount: 0, missingIdPlate: 0 })[2].done).toBe(false);
  });

  it('labels done once answered either way', () => {
    expect(checklistSteps({ labelsAnswer: null })[3].done).toBe(false);
    expect(checklistSteps({ labelsAnswer: 'done' })[3].done).toBe(true);
    expect(checklistSteps({ labelsAnswer: 'not-for-us' })[3].done).toBe(true);
  });
});

describe('the card', () => {
  it('does not show for a mature household', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={4} itemsCount={16} missingIdPlate={1} />);
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull();
  });

  it('shows for a new-ish household, with checked steps struck through', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={5} itemsCount={0} missingIdPlate={0} />);
    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-step-rooms')).toHaveAttribute('data-done', 'true');
    expect(screen.getByTestId('checklist-step-walk')).toHaveAttribute('data-done', 'false');
    // Prod's real shape (5 rooms, 0 items): the ID-plate step is NOT done.
    expect(screen.getByTestId('checklist-step-id-plate')).toHaveAttribute('data-done', 'false');
  });

  it('"Hide this list" stores the dismissal and the card disappears', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={0} itemsCount={0} missingIdPlate={0} />);
    fireEvent.click(screen.getByTestId('checklist-hide'));
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(HIDE_KEY))).toBe(true);
  });

  it('stays hidden on a later mount, once dismissed', () => {
    window.localStorage.setItem(HIDE_KEY, JSON.stringify(true));
    renderWithProviders(<OnboardingChecklist locationsCount={0} itemsCount={0} missingIdPlate={0} />);
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull();
  });

  it('labels: "Done" and "Not for us" both resolve the step and store the answer', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={0} itemsCount={0} missingIdPlate={0} />);
    expect(screen.getByTestId('checklist-step-labels')).toHaveAttribute('data-done', 'false');
    fireEvent.click(screen.getByTestId('checklist-labels-skip'));
    expect(screen.getByTestId('checklist-step-labels')).toHaveAttribute('data-done', 'true');
    expect(JSON.parse(window.localStorage.getItem(LABELS_KEY))).toBe('not-for-us');
  });
});
