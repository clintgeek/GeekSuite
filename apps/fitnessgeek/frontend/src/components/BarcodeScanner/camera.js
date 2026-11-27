/**
 * Opening the right camera, once.
 *
 * The scanner owns exactly one MediaStream at a time. The old one opened a
 * 1080p stream on a chosen camera and then let the decoder library open its
 * own default one over the top, so the resolution, the lens and the torch all
 * belonged to a stream nobody was looking at.
 */

const SAVED_CAMERA_KEY = 'barcodeScanCamera';

export const isIOS = () => {
  const ua = navigator.userAgent || '';
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
};

// iOS, best first. The "Triple" / "Dual Wide" / "Dual" devices are virtual:
// the phone switches between its lenses by itself, which is what lets it focus
// on a barcode a hand's width away. The plain "Back Camera" is the main lens
// alone, and on recent iPhones that lens cannot focus nearer than ~15 cm.
const IOS_REAR_ORDER = [
  /back triple camera/,
  /back dual wide camera/,
  /back dual camera/,
  /^back camera$/,
];

const SINGLE_ODD_LENS = /ultra|tele|macro|depth|infrared|\bir\b/;

const cameraNumber = (label) => {
  const match = label.match(/camera2?\s+(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

/**
 * Which rear camera to scan with, from `enumerateDevices()`.
 *
 * Returns the device, or null for "no opinion": labels are empty until the
 * person has allowed the camera, are translated on a non-English iPhone, and
 * mean nothing on a laptop. In all of those the camera the browser already
 * gave us for `facingMode: environment` is the right one to keep.
 */
export const pickRearCamera = (devices, { ios = isIOS() } = {}) => {
  const cameras = (devices || [])
    .filter((d) => d && d.kind === 'videoinput' && d.label)
    .map((device) => ({ device, label: device.label.toLowerCase().trim() }));
  if (cameras.length === 0) return null;

  if (ios) {
    for (const wanted of IOS_REAR_ORDER) {
      const hit = cameras.find((c) => wanted.test(c.label));
      if (hit) return hit.device;
    }
    // Never a lone Ultra Wide or Telephoto: neither focuses on a near pack.
    return null;
  }

  // Android: "camera2 0, facing back" is the main lens; the higher numbers are
  // the ultra-wide, macro and depth cameras, which make a barcode tiny or soft.
  const rear = cameras
    .filter((c) => /back|rear|environment/.test(c.label))
    .filter((c) => !SINGLE_ODD_LENS.test(c.label) && !/\bwide\b/.test(c.label));
  if (rear.length === 0) return null;
  rear.sort((a, b) => cameraNumber(a.label) - cameraNumber(b.label));
  return rear[0].device;
};

const readSavedCamera = () => {
  try {
    return localStorage.getItem(SAVED_CAMERA_KEY) || null;
  } catch {
    return null;
  }
};

const saveCamera = (deviceId) => {
  try {
    if (deviceId) localStorage.setItem(SAVED_CAMERA_KEY, deviceId);
  } catch {
    // A convenience: without it the next open takes one extra step.
  }
};

const stopStream = (stream) => {
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    // Already gone.
  }
};

// Sharp enough for thin bars, and every value an `ideal`: a `min` the phone
// cannot meet throws OverconstrainedError and there is no camera at all.
const SHARP = { width: { ideal: 1920 }, height: { ideal: 1080 } };

/**
 * getUserMedia with a ladder of looser and looser requests. A refusal by the
 * person (NotAllowedError) is final; anything else tries the next rung.
 */
const requestCamera = async (rungs) => {
  let lastError;
  for (const video of rungs) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      lastError = err;
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') throw err;
    }
  }
  throw lastError || new Error('No camera');
};

/**
 * Open the rear camera and return `{ stream, track }`.
 *
 * Step one asks for "the rear camera" by facing mode, because a phone gives no
 * camera names until the person has said yes. Step two reads the names and, if
 * a better rear camera exists than the one we were handed, CLOSES the first
 * stream and opens that one. Never two at once: an iPhone will not run two,
 * and the second silently kills the first.
 *
 * The choice is remembered, so the next open asks for it first and step two
 * finds nothing to change.
 */
export const openRearCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Camera access is not available');
    err.name = 'NotSupportedError';
    throw err;
  }

  const saved = readSavedCamera();
  const facing = { facingMode: { ideal: 'environment' } };
  let stream = await requestCamera([
    ...(saved ? [{ deviceId: { ideal: saved }, ...facing, ...SHARP }] : []),
    { ...facing, ...SHARP },
    facing,
    true,
  ]);

  try {
    const devices = (await navigator.mediaDevices.enumerateDevices?.()) || [];
    const wanted = pickRearCamera(devices);
    const current = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    if (wanted?.deviceId && wanted.deviceId !== current) {
      stopStream(stream);
      stream = null;
      stream = await requestCamera([
        { deviceId: { exact: wanted.deviceId }, ...SHARP },
        { deviceId: { exact: wanted.deviceId } },
        { ...facing, ...SHARP },
        facing,
      ]);
    }
    if (wanted?.deviceId) saveCamera(wanted.deviceId);
  } catch (err) {
    // Choosing a better lens is an improvement, not a requirement. If the
    // first stream is still open, scan with it.
    if (!stream) throw err;
  }

  const track = stream.getVideoTracks()[0];
  return { stream, track };
};

/**
 * What this camera can do, and continuous focus switched on if it has it.
 * Returns `{ torch, zoom }` where zoom is null or `{ base, close }`: the zoom
 * the camera opened at and twice that (or its maximum).
 */
export const prepareTrack = async (track) => {
  const caps = track?.getCapabilities?.() || {};
  const settings = track?.getSettings?.() || {};

  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch {
      // The camera keeps whatever focus it had.
    }
  }

  let zoom = null;
  if (caps.zoom && typeof caps.zoom.max === 'number') {
    const base = typeof settings.zoom === 'number' && settings.zoom > 0 ? settings.zoom : caps.zoom.min || 1;
    const close = Math.min(base * 2, caps.zoom.max);
    if (close >= base * 1.5) zoom = { base, close };
  }

  return { torch: Boolean(caps.torch), zoom };
};

export { stopStream };

/**
 * The part of the camera frame to look for a barcode in: what sits behind the
 * guide box, plus a margin, in the video's own pixels.
 *
 * The video is drawn `object-fit: cover`, so the box on screen shows only the
 * middle of a taller (or wider) frame. Decoding just that region means the
 * decoder is not hunting through shelf, hand and floor, and it gets the bars
 * at the camera's full resolution rather than a scaled-down whole frame.
 */
export const guideRegion = ({ videoWidth, videoHeight, boxWidth, boxHeight, guideWidth, guideHeight, margin = 1.35 }) => {
  if (!videoWidth || !videoHeight) return null;
  let w;
  let h;
  if (boxWidth > 0 && boxHeight > 0 && guideWidth > 0 && guideHeight > 0) {
    const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
    const visibleW = boxWidth / scale;
    const visibleH = boxHeight / scale;
    w = Math.min(visibleW, (guideWidth / scale) * margin);
    h = Math.min(visibleH, (guideHeight / scale) * margin);
  } else {
    // No layout to measure (not on screen yet): the middle of the frame.
    w = videoWidth * 0.8;
    h = videoHeight * 0.5;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  return {
    x: Math.round((videoWidth - w) / 2),
    y: Math.round((videoHeight - h) / 2),
    w,
    h,
  };
};
