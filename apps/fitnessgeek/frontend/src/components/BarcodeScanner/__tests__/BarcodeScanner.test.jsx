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

// None of this exercises a real camera (no getUserMedia ever succeeds) —
// jsdom has no `navigator.mediaDevices`, so the component's own existing
// fallback takes over on mount (`detectCameras()` sees
// `!navigator.mediaDevices?.enumerateDevices`, sets a camera error and drops
// to manual mode) and everything below tests that manual path: the
// 8-14-digit validation, the barcode lookup, and the localStorage-backed
// scan history. That fallback is what makes this component testable without
// a camera at all.

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
  // The mount effect always retries the camera ~100ms after
  // detectCameras() settles, regardless of which mode it landed on (see
  // BarcodeScanner.jsx's `useEffect` — it isn't gated on `mode`). Without a
  // native BarcodeDetector, that retry falls into the ZXing branch, which
  // appends a real `<script src="https://unpkg.com/...">` tag; jsdom never
  // fires its onload/onerror, so the promise (and `isLoading`) hangs
  // forever. Stubbing a native BarcodeDetector keeps the retry on the fast,
  // synchronous-failure path (`navigator.mediaDevices` is undefined in
  // jsdom, so `getUserMedia` throws immediately and the retry's `catch`
  // clears `isLoading` right away) instead of the hanging one.
  window.BarcodeDetector = class {
    static getSupportedFormats() {
      return Promise.resolve(['ean_13']);
    }
    detect() {
      return Promise.resolve([]);
    }
  };
});

afterEach(() => {
  localStorage.clear();
  delete window.BarcodeDetector;
});

describe('BarcodeScanner (camera-less environment)', () => {
  test('falls back to manual entry when the environment has no camera support', async () => {
    setup();

    // jsdom exposes no navigator.mediaDevices, so detectCameras() reports
    // "not supported" and the component switches itself to manual mode.
    expect(await screen.findByPlaceholderText('Enter 8-14 digit barcode')).toBeInTheDocument();
  });

  test('rejects a barcode that fails the 8-14 digit format before calling the lookup service', async () => {
    const user = userEvent.setup();
    setup();

    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    await user.type(input, '123');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(
      await screen.findByText('Invalid barcode format. Must be 8-14 digits.')
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

    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
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

    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(
      await screen.findByText(/No product found for this barcode/)
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

    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith(food));
    expect(await screen.findByText('Could not log that item. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('keeps the dialog open when the caller throws instead of resolving', async () => {
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn().mockRejectedValue(new Error('network down'));
    const onClose = vi.fn();
    const user = userEvent.setup();

    setup({ onBarcodeScanned, onClose });

    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));

    expect(await screen.findByText('Could not log that item. Try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('records a successful scan in localStorage and re-submits it from Recent Scans', async () => {
    const food = { id: 'usda_123', name: 'Test Food' };
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(food);
    const onBarcodeScanned = vi.fn();
    const user = userEvent.setup();

    const { unmount } = setup({ onBarcodeScanned });
    const input = await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    await user.type(input, '01234567890');
    await user.click(await screen.findByRole('button', { name: /look up barcode/i }));
    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledTimes(1));

    expect(JSON.parse(localStorage.getItem('barcodeScanHistory'))).toEqual(['01234567890']);
    unmount();

    // Fresh mount reads the history back and offers it as a one-tap re-scan.
    const onBarcodeScanned2 = vi.fn();
    setup({ onBarcodeScanned: onBarcodeScanned2 });
    await screen.findByPlaceholderText('Enter 8-14 digit barcode');
    fireEvent.click(screen.getByText('01234567890'));

    await waitFor(() => expect(onBarcodeScanned2).toHaveBeenCalledWith(food));
    expect(fitnessGeekService.getFoodByBarcode).toHaveBeenLastCalledWith('01234567890');
  });
});
