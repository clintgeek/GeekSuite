/**
 * Barcode scanning through the meal-slot sheet.
 *
 * Chef: "on the one-tap or barcode scan, the modal should close to show it
 * completed successfully." A scan used to close the scanner the instant a
 * product was *found* — before the log write even started — so a failed
 * write closed silently with nothing to see. These pin the fix: the whole
 * "Add Food" sheet closes only once the write actually succeeds, and a
 * failure leaves everything open with the error visible in the scanner.
 *
 * `UnifiedFoodSearch` is stubbed — its own barcode-adjacent behaviour (the
 * describe-and-log close) is covered in its own test file. This file drives
 * the real `BarcodeScanner` through its jsdom-camera-less manual-entry path
 * (see BarcodeScanner.test.jsx for why that's the hermetic way in).
 */
import React, { useState } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeekToastProvider } from '@geeksuite/ui';

vi.mock('../../FoodSearch', () => ({
  UnifiedFoodSearch: () => <div data-testid="unified-food-search" />
}));

vi.mock('../../../services/fitnessGeekService', () => ({
  fitnessGeekService: {
    getFoodByBarcode: vi.fn()
  }
}));

import { fitnessGeekService } from '../../../services/fitnessGeekService';
import AddFoodDialog from '../AddFoodDialog.jsx';

// A thin harness owning `showBarcodeScanner` the way FoodLog.jsx does, so the
// scanner starts open without going through a click on the (stubbed) box.
const Harness = ({ onLogItems, onUndo, onClose }) => {
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(true);
  return (
    <AddFoodDialog
      open={false}
      onClose={onClose}
      mealType="breakfast"
      onLogItems={onLogItems}
      onUndo={onUndo}
      showBarcodeScanner={showBarcodeScanner}
      onShowBarcodeScanner={setShowBarcodeScanner}
    />
  );
};

const renderHarness = (props = {}) =>
  render(
    <GeekToastProvider>
      <Harness onClose={vi.fn()} {...props} />
    </GeekToastProvider>
  );

const scan = async (user, barcode = '01234567890') => {
  const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
  await user.type(input, barcode);
  await user.click(await screen.findByRole('button', { name: /look up barcode/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  // Same fallback BarcodeScanner.test.jsx relies on: no real camera in
  // jsdom, so the component drops straight to manual entry.
  window.BarcodeDetector = class {
    static getSupportedFormats() { return Promise.resolve(['ean_13']); }
    detect() { return Promise.resolve([]); }
  };
});

afterEach(() => {
  delete window.BarcodeDetector;
  localStorage.clear();
});

describe('scanning a barcode from the meal-slot sheet', () => {
  test('a successful log closes the whole sheet and toasts the result, with undo', async () => {
    const food = { id: 'usda_1', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    const onUndo = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderHarness({ onLogItems, onUndo, onClose });
    await scan(user);

    await waitFor(() => expect(onLogItems).toHaveBeenCalledWith(
      [{ ...food, servings: 1 }],
      'breakfast'
    ));
    expect(await screen.findByText(/Logged Test Food/)).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('a failed log keeps the sheet open, with the error visible, and never closes it', async () => {
    const food = { id: 'usda_1', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onLogItems = vi.fn().mockResolvedValue({ ok: 0, fail: 1, logIds: [] });
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderHarness({ onLogItems, onClose });
    await scan(user);

    await waitFor(() => expect(onLogItems).toHaveBeenCalled());
    expect(await screen.findByText('Could not log that item. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // The scanner itself is still mounted/open — its own "look up" field is
    // still on screen, not swapped for the (stubbed) search box.
    expect(screen.getByPlaceholderText('Enter 8-14 digit barcode')).toBeInTheDocument();
  });

  test('a thrown log error keeps the sheet open the same way a reported failure does', async () => {
    const food = { id: 'usda_1', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onLogItems = vi.fn().mockRejectedValue(new Error('network down'));
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderHarness({ onLogItems, onClose });
    await scan(user);

    expect(await screen.findByText('Could not log that item. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
