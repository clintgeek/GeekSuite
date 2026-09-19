/**
 * FoodSearchPage IS the "one tap to log it" path — the page's whole reason
 * to exist is that tapping a search result logs it immediately, no staging
 * step. The meal type it logs to used to hardcode `useState('snack')`, so
 * tapping a result before 10am (breakfast) or between 10am-3pm (lunch) still
 * filed it under Snacks until the user noticed the chip and fixed it by hand.
 *
 * This pins that a fresh visit to the page defaults its meal chip — and what
 * a tap actually logs — to `mealTypeForNow()`, not a hardcoded 'snack'. Before
 * the fix (`useState('snack')`), both assertions below failed at 8am.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const logItems = vi.fn();

// The box itself is covered by its own test file; here it's a thin stub that
// exposes exactly what this test needs — the `mealType` it was handed, and a
// button that calls `onLogItems` the way tapping a real result row would.
vi.mock('../../components/FoodSearch', () => ({
  UnifiedFoodSearch: ({ mealType, onLogItems }) => (
    <div>
      <div data-testid="meal-type">{mealType}</div>
      <button onClick={() => onLogItems([{ id: 'f1', name: 'Eggs', servings: 1 }], mealType)}>
        Log result
      </button>
    </div>
  )
}));

vi.mock('../../components/BarcodeScanner/BarcodeScanner.jsx', () => ({
  default: () => null
}));

vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({
    logItems,
    undoLogs: vi.fn(),
    describeMeal: vi.fn(),
    adjustLogCalories: vi.fn(),
    createFood: vi.fn()
  })
}));

const { default: FoodSearchPage } = await import('../FoodSearch.jsx');

const renderPage = () =>
  render(
    <GeekToastProvider>
      <FoodSearchPage />
    </GeekToastProvider>
  );

const setHour = (hour) => {
  const now = new Date();
  now.setHours(hour, 0, 0, 0);
  vi.setSystemTime(now);
};

beforeEach(() => {
  vi.useFakeTimers();
  logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['log1'], perItem: [['log1']] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the default meal type follows the clock, not a hardcoded snack', () => {
  it('defaults to breakfast before 10am', () => {
    setHour(8);
    renderPage();
    expect(screen.getByTestId('meal-type').textContent).toBe('breakfast');
  });

  it('tapping a result at breakfast time logs it as breakfast', () => {
    setHour(8);
    renderPage();
    fireEvent.click(screen.getByText('Log result'));
    expect(logItems).toHaveBeenCalledWith(
      [{ id: 'f1', name: 'Eggs', servings: 1 }],
      'breakfast'
    );
  });

  it('defaults to lunch mid-day, not snack', () => {
    setHour(12);
    renderPage();
    expect(screen.getByTestId('meal-type').textContent).toBe('lunch');
  });

  it('still defaults to snack late at night', () => {
    setHour(22);
    renderPage();
    expect(screen.getByTestId('meal-type').textContent).toBe('snack');
  });
});
