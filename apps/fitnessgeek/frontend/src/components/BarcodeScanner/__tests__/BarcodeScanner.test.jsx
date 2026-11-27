import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// fitnessGeekService talks to the real backend — mock it so manual-entry
// lookups stay hermetic (no network, no Mongo).
vi.mock('../../../services/fitnessGeekService', () => ({
  fitnessGeekService: {
    getFoodByBarcode: vi.fn(),
  },
}));

import { fitnessGeekService } from '../../../services/fitnessGeekService';
import BarcodeScanner from '../BarcodeScanner.jsx';

// This file is the camera-less half: jsdom has no `navigator.mediaDevices`, so
// the scanner reports that it can't use the camera and drops to typing the
// number. Everything below tests that path — the 8–14 digit rule, the lookup,
// and the localStorage-backed history. The camera, the decoders and the photo
// fallback are in BarcodeScannerCamera.test.jsx.

const setup = (props = {}) =>
  render(
    <BarcodeScanner
      open
      onClose={vi.fn()}
      onBarcodeScanned={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('BarcodeScanner (camera-less environment)', () => {
  test('falls back to manual entry when the environment has no camera support', async () => {
    setup();

    // jsdom exposes no navigator.mediaDevices, so the scanner says so and
    // switches itself to typing.
    expect(await screen.findByPlaceholderText('8–14 digits')).toBeInTheDocument();
    expect(
      screen.getByText('FitnessGeek can’t use the camera here. Type the barcode instead.')
    ).toBeInTheDocument();
    // The photo route needs no camera permission, so it is still offered.
    expect(screen.getByRole('button', { name: 'Take a photo instead' })).toBeInTheDocument();
  });

  test('rejects a barcode that fails the 8-14 digit format before calling the lookup service', async () => {
    const user = userEvent.setup();
    setup();

    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '123');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(
      await screen.findByText('A barcode is 8–14 digits. Check the number and try again.')
    ).toBeInTheDocument();
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
  });

  test('looks up a well-formed barcode, reports the match back, and closes once the caller confirms it logged', async () => {
    // `onBarcodeScanned` now does the actual write and hands back whether it
    // landed (see BarcodeScanner.jsx's own comment) — finding the product is
    // not the same thing as logging it, so the scanner only closes once the
    // caller resolves truthy.
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    const user = userEvent.setup();

    setup({ onBarcodeScanned, onClose });

    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith(food));
    expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith('01234567890');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('shows a not-found message and keeps the dialog open when nothing matches', async () => {
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(null);
    const onClose = vi.fn();
    const user = userEvent.setup();

    setup({ onClose });

    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(
      await screen.findByText(/That barcode isn’t in the food databases/)
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('finds the product but keeps the dialog open, with the failure visible, when the caller could not log it', async () => {
    // The bug this pins: the scanner used to close the moment a product was
    // found, before the caller had even tried to write the log — a failed
    // write then closed silently, with no error anywhere. Chef: a partial or
    // failed log must leave the modal open with the error visible.
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    const user = userEvent.setup();

    setup({ onBarcodeScanned, onClose });

    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith(food));
    expect(await screen.findByText('Couldn’t add that. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('keeps the dialog open when the caller throws instead of resolving', async () => {
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn().mockRejectedValue(new Error('network down'));
    const onClose = vi.fn();
    const user = userEvent.setup();

    setup({ onBarcodeScanned, onClose });

    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(await screen.findByText('Couldn’t add that. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('records a successful scan in localStorage and re-submits it from Recent Scans', async () => {
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn();
    const user = userEvent.setup();

    const { unmount } = setup({ onBarcodeScanned });
    const input = await screen.findByPlaceholderText('8–14 digits');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));
    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledTimes(1));

    expect(JSON.parse(localStorage.getItem('barcodeScanHistory'))).toEqual(['01234567890']);
    unmount();

    // Fresh mount reads the history back and offers it as a one-tap re-scan.
    const onBarcodeScanned2 = vi.fn();
    setup({ onBarcodeScanned: onBarcodeScanned2 });
    await screen.findByPlaceholderText('8–14 digits');
    fireEvent.click(screen.getByText('01234567890'));

    await waitFor(() => expect(onBarcodeScanned2).toHaveBeenCalledWith(food));
    expect(fitnessGeekService.getFoodByBarcode).toHaveBeenLastCalledWith('01234567890');
  });
});
