import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The scanner with a camera: a fake `navigator.mediaDevices`, a fake video
 * frame, and both decoders (Android's built-in `BarcodeDetector`, stubbed on
 * `window`; the WebAssembly one, mocked as a module so no .wasm is loaded).
 *
 * What a fake cannot show is whether a real lens focuses on a real pack — that
 * needs the phones. What it does pin is everything around it: one camera
 * stream at a time, the right camera asked for, misreads dropped, the photo
 * route, and the camera let go when the scanner is not on screen.
 */

vi.mock('../../../services/fitnessGeekService', () => ({
  fitnessGeekService: { getFoodByBarcode: vi.fn() },
}));

vi.mock('../wasmDecoder.js', () => ({
  decodeFrame: vi.fn(async () => []),
  decodePhoto: vi.fn(async () => []),
}));

import { fitnessGeekService } from '../../../services/fitnessGeekService';
import { decodeFrame, decodePhoto } from '../wasmDecoder.js';
import BarcodeScanner from '../BarcodeScanner.jsx';

const UPC_A = '036000291452';
const UPC_A_BAD_CHECK = '036000291453';
const EAN_13 = '4006381333931';
const FOOD = { id: 'off_1', name: 'Test Food' };

// ─── The fake phone ────────────────────────────────────────────────────────

let streams;
let mostLiveAtOnce;
let nativeReads;

const liveStreams = () => streams.filter((s) => s.track.readyState === 'live');

const makeStream = (deviceId, capabilities) => {
  const track = {
    readyState: 'live',
    stop: vi.fn(() => { track.readyState = 'ended'; }),
    getSettings: () => ({ deviceId, ...(capabilities.zoom ? { zoom: 1 } : {}) }),
    getCapabilities: () => capabilities,
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
  return { deviceId, track, getTracks: () => [track], getVideoTracks: () => [track] };
};

const installCamera = ({ devices = [], defaultId = 'default', capabilities = {}, getUserMedia } = {}) => {
  const open = vi.fn(async (constraints) => {
    const wanted = constraints?.video?.deviceId;
    const stream = makeStream(wanted?.exact ?? wanted?.ideal ?? defaultId, capabilities);
    streams.push(stream);
    mostLiveAtOnce = Math.max(mostLiveAtOnce, liveStreams().length);
    return stream;
  });
  const mediaDevices = {
    getUserMedia: getUserMedia || open,
    enumerateDevices: vi.fn(async () => devices),
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  return mediaDevices;
};

/** Android Chrome: a built-in detector that knows the product formats. */
const installNativeDetector = () => {
  window.BarcodeDetector = class {
    static getSupportedFormats() {
      return Promise.resolve(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']);
    }
    detect() {
      return Promise.resolve(typeof nativeReads === 'function' ? nativeReads() : nativeReads);
    }
  };
};

const setUserAgent = (ua) =>
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });

const setHidden = (hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

const cam = (label, deviceId) => ({ kind: 'videoinput', label, deviceId });

const setup = (props = {}) =>
  render(<BarcodeScanner open onClose={vi.fn()} onBarcodeScanned={vi.fn().mockResolvedValue(true)} {...props} />);

const scanning = () =>
  waitFor(() => expect(screen.getByTestId('scanner-guide')).toHaveAttribute('data-state', 'scanning'));

const saved = {};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  streams = [];
  mostLiveAtOnce = 0;
  nativeReads = [];
  decodeFrame.mockImplementation(async () => []);
  decodePhoto.mockImplementation(async () => []);

  // jsdom draws nothing: give the scanner a video with a size and a canvas it
  // can "draw" on, so the scan loop has a frame to hand the decoder.
  saved.play = HTMLMediaElement.prototype.play;
  saved.getContext = HTMLCanvasElement.prototype.getContext;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  }));
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1920 });
  navigator.vibrate = vi.fn();
});

afterEach(() => {
  HTMLMediaElement.prototype.play = saved.play;
  HTMLCanvasElement.prototype.getContext = saved.getContext;
  delete HTMLMediaElement.prototype.readyState;
  delete HTMLVideoElement.prototype.videoWidth;
  delete HTMLVideoElement.prototype.videoHeight;
  delete navigator.mediaDevices;
  delete navigator.userAgent;
  delete navigator.vibrate;
  delete document.hidden;
  delete window.BarcodeDetector;
  localStorage.clear();
});

// ─── Reading a barcode ─────────────────────────────────────────────────────

describe('reading a barcode from the camera', () => {
  test('looks up a good read, says "Got it", buzzes, and closes once it is logged', async () => {
    installCamera();
    installNativeDetector();
    nativeReads = [{ rawValue: UPC_A, format: 'upc_a' }];
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(FOOD);
    const onBarcodeScanned = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();

    setup({ onBarcodeScanned, onClose });

    await waitFor(() => expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith(UPC_A));
    expect(navigator.vibrate).toHaveBeenCalled();
    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith(FOOD));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('barcodeScanHistory'))).toEqual([UPC_A]);
  });

  test('shows "Got it" on the frame while the product is being looked up', async () => {
    installCamera();
    installNativeDetector();
    nativeReads = [{ rawValue: UPC_A, format: 'upc_a' }];
    let finish;
    fitnessGeekService.getFoodByBarcode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    setup();

    expect(await screen.findByText('Got it')).toBeInTheDocument();
    expect(screen.getByTestId('scanner-guide')).toHaveAttribute('data-state', 'got');
    expect(screen.getByText('Looking it up…')).toBeInTheDocument();
    await act(async () => { finish(null); });
  });

  test('ignores a read with a bad check digit: nothing is looked up, the camera keeps going', async () => {
    installCamera();
    installNativeDetector();
    const detect = vi.fn(() => [{ rawValue: UPC_A_BAD_CHECK, format: 'upc_a' }]);
    nativeReads = detect;
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(FOOD);

    setup();
    await scanning();

    // Plenty of looks at the misread, the same wrong number every time...
    await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
    expect(screen.getByTestId('scanner-guide')).toHaveAttribute('data-state', 'scanning');
    expect(liveStreams()).toHaveLength(1);

    // ...and then the pack comes into focus.
    nativeReads = [{ rawValue: UPC_A, format: 'upc_a' }];
    await waitFor(() => expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith(UPC_A));
    expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledTimes(1);
  });

  test('ignores a QR code or any non-product read', async () => {
    installCamera();
    installNativeDetector();
    const detect = vi.fn(() => [{ rawValue: 'https://example.com/p/1', format: 'qr_code' }]);
    nativeReads = detect;

    setup();
    await scanning();

    await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
  });

  test('does not act on a number seen only once', async () => {
    installCamera();
    installNativeDetector();
    let looks = 0;
    // A valid number on the first look only (a fluke), then nothing.
    nativeReads = () => {
      looks += 1;
      return looks === 1 ? [{ rawValue: EAN_13, format: 'ean_13' }] : [];
    };

    setup();
    await scanning();

    await waitFor(() => expect(looks).toBeGreaterThanOrEqual(4));
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
  });

  test('never runs two looks at once, however slow the decoder is', async () => {
    installCamera();
    installNativeDetector();
    let inFlight = 0;
    let mostInFlight = 0;
    let looks = 0;
    nativeReads = () => {
      looks += 1;
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      return new Promise((resolve) => setTimeout(() => { inFlight -= 1; resolve([]); }, 150));
    };

    setup();
    await scanning();

    await waitFor(() => expect(looks).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    expect(mostInFlight).toBe(1);
  });

  test('uses the bundled WebAssembly decoder where there is no built-in one (iPhone)', async () => {
    installCamera();
    // No window.BarcodeDetector. zxing-cpp spells a US pack as 13 digits.
    decodeFrame.mockImplementation(async () => [{ rawValue: `0${UPC_A}`, format: 'EAN13' }]);
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(FOOD);

    setup();

    await waitFor(() => expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith(UPC_A));
    expect(decodeFrame).toHaveBeenCalled();
  });

  test('keeps the scanner open with the reason when the product is not in the databases', async () => {
    installCamera();
    installNativeDetector();
    nativeReads = [{ rawValue: UPC_A, format: 'upc_a' }];
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(null);
    const onClose = vi.fn();

    setup({ onClose });

    expect(await screen.findByText(/That barcode isn’t in the food databases/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // The camera was let go for the lookup; one tap brings it back.
    expect(liveStreams()).toHaveLength(0);
    expect(await screen.findByRole('button', { name: 'Start camera' })).toBeInTheDocument();
  });
});

// ─── The camera itself ─────────────────────────────────────────────────────

describe('the camera stream', () => {
  test('opens exactly one stream, and the decoder never opens another', async () => {
    const media = installCamera();
    installNativeDetector();

    setup();
    await scanning();
    // Let the scan loop run for a while: nothing in it may touch the camera.
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(streams).toHaveLength(1);
    expect(liveStreams()).toHaveLength(1);
    // The stream on screen IS the one that was opened.
    expect(document.querySelector('video').srcObject).toBe(streams[0]);
  });

  test('on an iPhone, moves to the multi-lens rear camera and never has two streams open', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
    const media = installCamera({
      defaultId: 'back',
      devices: [
        cam('Front Camera', 'front'),
        cam('Back Camera', 'back'),
        cam('Back Ultra Wide Camera', 'ultra'),
        cam('Back Dual Wide Camera', 'dualwide'),
      ],
    });
    decodeFrame.mockImplementation(async () => []);

    setup();
    await scanning();

    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(media.getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: 'environment' });
    expect(media.getUserMedia.mock.calls[1][0].video.deviceId).toEqual({ exact: 'dualwide' });
    expect(streams.map((s) => s.deviceId)).toEqual(['back', 'dualwide']);
    // The first was closed before the second opened.
    expect(mostLiveAtOnce).toBe(1);
    expect(liveStreams().map((s) => s.deviceId)).toEqual(['dualwide']);
    expect(document.querySelector('video').srcObject).toBe(streams[1]);
  });

  test('on an iPhone with only odd lenses listed, keeps the camera it was given', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)');
    const media = installCamera({
      defaultId: 'given',
      devices: [cam('Front Camera', 'front'), cam('Back Ultra Wide Camera', 'ultra'), cam('Back Telephoto Camera', 'tele')],
    });

    setup();
    await scanning();

    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(liveStreams().map((s) => s.deviceId)).toEqual(['given']);
  });

  test('stops the camera when the scanner is closed by its parent', async () => {
    installCamera();
    installNativeDetector();
    const props = { onClose: vi.fn(), onBarcodeScanned: vi.fn() };
    const { rerender } = render(<BarcodeScanner open {...props} />);
    await scanning();
    expect(liveStreams()).toHaveLength(1);

    rerender(<BarcodeScanner open={false} {...props} />);

    expect(streams[0].track.stop).toHaveBeenCalled();
    expect(liveStreams()).toHaveLength(0);
  });

  test('stops the camera on Cancel, and on unmount', async () => {
    installCamera();
    installNativeDetector();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const first = setup({ onClose });
    await scanning();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(liveStreams()).toHaveLength(0);
    first.unmount();

    const second = setup();
    await scanning();
    expect(liveStreams()).toHaveLength(1);
    second.unmount();
    expect(liveStreams()).toHaveLength(0);
  });

  test('stops the camera when the tab changes to typing', async () => {
    installCamera();
    installNativeDetector();
    const user = userEvent.setup();
    setup();
    await scanning();

    await user.click(screen.getByRole('tab', { name: /type it/i }));

    expect(liveStreams()).toHaveLength(0);
    expect(await screen.findByPlaceholderText('8–14 digits')).toBeInTheDocument();
  });

  test('lets the camera go when the app is hidden and takes it back when shown', async () => {
    const media = installCamera();
    installNativeDetector();
    setup();
    await scanning();

    act(() => setHidden(true));
    expect(liveStreams()).toHaveLength(0);

    act(() => setHidden(false));
    await scanning();
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(liveStreams()).toHaveLength(1);
    expect(mostLiveAtOnce).toBe(1);
  });

  test('a camera that opens after the scanner has closed is shut straight away', async () => {
    let release;
    const late = makeStream('late', {});
    installCamera({
      getUserMedia: vi.fn(() => new Promise((resolve) => { release = () => resolve(late); })),
    });
    installNativeDetector();
    const props = { onClose: vi.fn(), onBarcodeScanned: vi.fn() };
    const { rerender } = render(<BarcodeScanner open {...props} />);
    await waitFor(() => expect(release).toBeTypeOf('function'));

    rerender(<BarcodeScanner open={false} {...props} />);
    await act(async () => { release(); });

    await waitFor(() => expect(late.track.stop).toHaveBeenCalled());
  });

  test('says how to allow the camera when the person has blocked it, and offers typing', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    installCamera({ getUserMedia: vi.fn().mockRejectedValue(denied) });
    installNativeDetector();

    setup();

    expect(
      await screen.findByText('FitnessGeek needs your camera to scan. Allow it in your browser settings, or type the barcode.')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('8–14 digits')).toBeInTheDocument();
  });
});

// ─── Light and zoom ────────────────────────────────────────────────────────

describe('light and zoom', () => {
  test('are not shown on a camera that has neither', async () => {
    installCamera();
    installNativeDetector();
    setup();
    await scanning();

    expect(screen.queryByRole('button', { name: /light/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Zoom' })).not.toBeInTheDocument();
  });

  test('the light switches the torch on the stream that is on screen', async () => {
    installCamera({ capabilities: { torch: true } });
    installNativeDetector();
    const user = userEvent.setup();
    setup();
    await scanning();

    await user.click(await screen.findByRole('button', { name: 'Turn the light on' }));

    expect(streams[0].track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(await screen.findByRole('button', { name: 'Turn the light off' })).toBeInTheDocument();
  });

  test('2× zooms the camera in, 1× puts it back', async () => {
    installCamera({ capabilities: { zoom: { min: 1, max: 5, step: 0.1 } } });
    installNativeDetector();
    const user = userEvent.setup();
    setup();
    await scanning();

    await user.click(await screen.findByRole('button', { name: 'Zoom in' }));
    expect(streams[0].track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ zoom: 2 }] });

    await user.click(screen.getByRole('button', { name: 'Normal zoom' }));
    expect(streams[0].track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ zoom: 1 }] });
  });
});

// ─── Take a photo instead ──────────────────────────────────────────────────

describe('take a photo instead', () => {
  const photo = () => new File(['jpeg bytes'], 'pack.jpg', { type: 'image/jpeg' });
  const choosePhoto = () =>
    fireEvent.change(screen.getByTestId('scanner-photo-input'), { target: { files: [photo()] } });

  test('opens the phone’s own rear camera', async () => {
    installCamera();
    installNativeDetector();
    setup();
    await scanning();

    const input = screen.getByTestId('scanner-photo-input');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');

    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await userEvent.setup().click(screen.getByRole('button', { name: 'Take a photo instead' }));

    expect(click).toHaveBeenCalled();
    // The live camera is let go first: the phone's camera app needs the lens.
    expect(liveStreams()).toHaveLength(0);
  });

  test('reads the barcode in the photo, looks it up and logs it', async () => {
    installCamera();
    installNativeDetector();
    decodePhoto.mockResolvedValue([{ rawValue: EAN_13, format: 'EAN13' }]);
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(FOOD);
    const onBarcodeScanned = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    setup({ onBarcodeScanned, onClose });
    await scanning();

    choosePhoto();

    await waitFor(() => expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith(EAN_13));
    expect(decodePhoto).toHaveBeenCalledWith(expect.any(File));
    await waitFor(() => expect(onBarcodeScanned).toHaveBeenCalledWith(FOOD));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('says so in plain words when the photo has no readable barcode', async () => {
    installCamera();
    installNativeDetector();
    decodePhoto.mockResolvedValue([]);
    const onClose = vi.fn();
    setup({ onClose });
    await scanning();

    choosePhoto();

    expect(
      await screen.findByText('I couldn’t read a barcode in that photo. Try again a little further away, or type the number.')
    ).toBeInTheDocument();
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Still here to try again.
    expect(screen.getByRole('button', { name: 'Take a photo instead' })).toBeEnabled();
  });

  test('treats a photo read with a bad check digit as unreadable, not as a product', async () => {
    installCamera();
    installNativeDetector();
    decodePhoto.mockResolvedValue([{ rawValue: UPC_A_BAD_CHECK, format: 'UPCA' }]);
    setup();
    await scanning();

    choosePhoto();

    expect(await screen.findByText(/I couldn’t read a barcode in that photo/)).toBeInTheDocument();
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
  });

  test('says the same when the photo cannot be opened at all', async () => {
    installCamera();
    installNativeDetector();
    decodePhoto.mockRejectedValue(new Error('That picture could not be opened.'));
    setup();
    await scanning();

    choosePhoto();

    expect(await screen.findByText(/I couldn’t read a barcode in that photo/)).toBeInTheDocument();
    expect(fitnessGeekService.getFoodByBarcode).not.toHaveBeenCalled();
  });

  test('works with no camera permission at all, from the typing tab', async () => {
    // No navigator.mediaDevices: the scanner is on "Type it".
    decodePhoto.mockResolvedValue([{ rawValue: UPC_A, format: 'UPCA' }]);
    fitnessGeekService.getFoodByBarcode.mockResolvedValue(FOOD);
    setup();
    await screen.findByPlaceholderText('8–14 digits');

    choosePhoto();

    await waitFor(() => expect(fitnessGeekService.getFoodByBarcode).toHaveBeenCalledWith(UPC_A));
  });
});
