/**
 * Barcode scanning on the dedicated `/food-search` page.
 *
 * This page has no enclosing dialog to close, so "close on success" means:
 * the scanner itself closes and a toast confirms what landed, with undo. A
 * failed write leaves the scanner open with the error visible — the same
 * contract AddFoodDialog.test.jsx pins for the meal-slot sheet, exercised
 * here against the page's own wiring (`pages/FoodSearch.jsx`), which is a
 * separate call site from AddFoodDialog's and could drift from it.
 *
 * FoodSearch.test.jsx already covers this page's meal-type default and
 * mocks BarcodeScanner away entirely; this file does the opposite — it
 * mocks the search box (irrelevant here) and drives the real scanner
 * through its jsdom-camera-less manual-entry path.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeekToastProvider } from '@geeksuite/ui';

const logItems = vi.fn();
const undoLogs = vi.fn();

vi.mock('../../components/FoodSearch', () => ({
  UnifiedFoodSearch: ({ onBarcodeClick }) => (
    <button onClick={() => onBarcodeClick?.()}>Scan barcode</button>
  )
}));

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    getFoodByBarcode: vi.fn(),
    formatDate: () => '2026-09-22'
  }
}));

vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({
    logItems,
    undoLogs,
    describeMeal: vi.fn(),
    adjustLogCalories: vi.fn(),
    createFood: vi.fn()
  })
}));

import { fitnessGeekService } from '../../services/fitnessGeekService.js';
const { default: FoodSearchPage } = await import('../FoodSearch.jsx');

const renderPage = () =>
  render(
    <GeekToastProvider>
      <FoodSearchPage />
    </GeekToastProvider>
  );

const scan = async (user, barcode = '01234567890') => {
  await user.click(screen.getByRole('button', { name: /scan barcode/i }));
  const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
  await user.type(input, barcode);
  await user.click(await screen.findByRole('button', { name: /look up barcode/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  window.BarcodeDetector = class {
    static getSupportedFormats() { return Promise.resolve(['ean_13']); }
    detect() { return Promise.resolve([]); }
  };
  logItems.mockReset();
});

afterEach(() => {
  delete window.BarcodeDetector;
  localStorage.clear();
});

describe('scanning a barcode on the full-page search', () => {
  test('a successful log closes the scanner and toasts the result, with undo', async () => {
    const food = { id: 'usda_1', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    const user = userEvent.setup();

    renderPage();
    await scan(user);

    await waitFor(() => expect(logItems).toHaveBeenCalledWith(
      [{ ...food, servings: 1 }],
      expect.any(String)
    ));
    expect(await screen.findByText(/Logged Test Food/)).toBeInTheDocument();
    // The scanner's own field is gone once it has closed.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Enter 8-14 digit barcode')).not.toBeInTheDocument()
    );
  });

  test('a failed log keeps the scanner open with the error visible', async () => {
    const food = { id: 'usda_1', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    logItems.mockResolvedValue({ ok: 0, fail: 1, logIds: [] });
    const user = userEvent.setup();

    renderPage();
    await scan(user);

    await waitFor(() => expect(logItems).toHaveBeenCalled());
    expect(await screen.findByText('Could not log that item. Try again.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter 8-14 digit barcode')).toBeInTheDocument();
  });
});
