import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickRearCamera, guideRegion, openRearCamera, prepareTrack } from '../camera.js';

const cam = (label, deviceId = label) => ({ kind: 'videoinput', label, deviceId });

describe('pickRearCamera on an iPhone', () => {
  const PRO = [
    cam('Front Camera'),
    cam('Back Camera'),
    cam('Back Ultra Wide Camera'),
    cam('Back Telephoto Camera'),
    cam('Back Dual Wide Camera'),
    cam('Back Triple Camera'),
  ];

  test('prefers the triple camera, which changes lens to focus up close', () => {
    expect(pickRearCamera(PRO, { ios: true }).label).toBe('Back Triple Camera');
  });

  test('takes the "Dual Wide" camera — the one the old "wide" filter threw away', () => {
    const iphone13 = [cam('Front Camera'), cam('Back Camera'), cam('Back Ultra Wide Camera'), cam('Back Dual Wide Camera')];
    expect(pickRearCamera(iphone13, { ios: true }).label).toBe('Back Dual Wide Camera');
  });

  test('takes a dual camera over the plain back camera', () => {
    const older = [cam('Back Camera'), cam('Back Dual Camera'), cam('Back Telephoto Camera'), cam('Front Camera')];
    expect(pickRearCamera(older, { ios: true }).label).toBe('Back Dual Camera');
  });

  test('falls back to the plain back camera on a one-lens phone', () => {
    expect(pickRearCamera([cam('Front Camera'), cam('Back Camera')], { ios: true }).label).toBe('Back Camera');
  });

  test('never picks a lone Ultra Wide or Telephoto', () => {
    const odd = [cam('Front Camera'), cam('Back Ultra Wide Camera'), cam('Back Telephoto Camera')];
    expect(pickRearCamera(odd, { ios: true })).toBeNull();
  });

  test('has no opinion before permission, when the names are blank', () => {
    expect(pickRearCamera([cam(''), cam('')], { ios: true })).toBeNull();
  });
});

describe('pickRearCamera on Android', () => {
  test('takes the main rear camera, not the ultra-wide, macro or depth ones', () => {
    const pixel = [
      cam('camera2 1, facing front'),
      cam('camera2 3, facing back, ultra wide'),
      cam('camera2 2, facing back, macro'),
      cam('camera2 0, facing back'),
      cam('camera2 4, facing back, depth'),
    ];
    expect(pickRearCamera(pixel, { ios: false }).label).toBe('camera2 0, facing back');
  });

  test('takes the lowest-numbered of several plain rear cameras', () => {
    const many = [cam('camera2 2, facing back'), cam('camera2 0, facing back'), cam('camera2 1, facing front')];
    expect(pickRearCamera(many, { ios: false }).label).toBe('camera2 0, facing back');
  });

  test('has no opinion on a laptop', () => {
    expect(pickRearCamera([cam('Integrated Webcam')], { ios: false })).toBeNull();
  });
});

describe('guideRegion', () => {
  test('is the part of a portrait frame behind the guide box, with a margin', () => {
    // 1080x1920 frame, drawn "cover" in a 358x260 box: scale 358/1080, so the
    // box shows the full width and the middle ~784px of the height.
    const region = guideRegion({
      videoWidth: 1080, videoHeight: 1920,
      boxWidth: 358, boxHeight: 260,
      guideWidth: 300, guideHeight: 125,
    });
    expect(region.w).toBe(1080);                 // 300 * 1.35 / scale > full width: clamped
    expect(region.h).toBeGreaterThan(125 * (1080 / 358)); // more than the box itself
    expect(region.h).toBeLessThan(784);          // but never what is off screen
    expect(region.x).toBe(0);
    expect(region.y).toBe(Math.round((1920 - region.h) / 2));
  });

  test('uses the middle of the frame when nothing can be measured', () => {
    expect(guideRegion({ videoWidth: 1000, videoHeight: 500 })).toEqual({ x: 100, y: 125, w: 800, h: 250 });
  });

  test('is null until the video has a size', () => {
    expect(guideRegion({ videoWidth: 0, videoHeight: 0 })).toBeNull();
  });
});

describe('openRearCamera', () => {
  const makeStream = (deviceId) => {
    const track = { stop: vi.fn(), getSettings: () => ({ deviceId }) };
    return { getTracks: () => [track], getVideoTracks: () => [track], track };
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    delete navigator.mediaDevices;
    localStorage.clear();
  });

  const install = (getUserMedia, devices = []) => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue(devices) },
    });
  };

  // Walks a constraint set looking for `min` / `exact` keys.
  const keysIn = (value, found = new Set()) => {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        found.add(k);
        keysIn(v, found);
      }
    }
    return found;
  };

  test('asks for the rear camera with `ideal` values only — nothing that can over-constrain', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeStream('main'));
    install(getUserMedia);

    await openRearCamera();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const { video, audio } = getUserMedia.mock.calls[0][0];
    expect(audio).toBe(false);
    expect(video.facingMode).toEqual({ ideal: 'environment' });
    expect(keysIn(video).has('min')).toBe(false);
    expect(keysIn(video).has('exact')).toBe(false);
  });

  test('tries a looser request when the phone refuses the first', async () => {
    const over = Object.assign(new Error('nope'), { name: 'OverconstrainedError' });
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(over)
      .mockResolvedValueOnce(makeStream('main'));
    install(getUserMedia);

    const { stream } = await openRearCamera();

    expect(stream).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    // The second ask dropped the resolution and kept only "rear camera".
    expect(getUserMedia.mock.calls[1][0].video).toEqual({ facingMode: { ideal: 'environment' } });
  });

  test('does not keep asking once the person has said no', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    install(getUserMedia);

    await expect(openRearCamera()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  test('closes the first stream before opening the better camera, and remembers the choice', async () => {
    const a = makeStream('wide');
    const b = makeStream('zero');
    const gum = vi.fn().mockImplementation(async () => {
      if (gum.mock.calls.length === 1) return a;
      expect(a.track.stop).toHaveBeenCalled();
      return b;
    });
    install(gum, [cam('camera2 2, facing back, ultra wide', 'wide'), cam('camera2 0, facing back', 'zero')]);

    const opened = await openRearCamera();
    expect(opened.stream).toBe(b);
    expect(gum.mock.calls[1][0].video.deviceId).toEqual({ exact: 'zero' });
    expect(b.track.stop).not.toHaveBeenCalled();

    // Next time it asks for that camera first, and has nothing to change.
    const c = makeStream('zero');
    const again = vi.fn().mockResolvedValue(c);
    install(again, [cam('camera2 2, facing back, ultra wide', 'wide'), cam('camera2 0, facing back', 'zero')]);
    await openRearCamera();
    expect(again).toHaveBeenCalledTimes(1);
    expect(again.mock.calls[0][0].video.deviceId).toEqual({ ideal: 'zero' });
  });
});

describe('prepareTrack', () => {
  test('turns continuous focus on where the camera offers it', async () => {
    const track = {
      getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
      getSettings: () => ({}),
      applyConstraints: vi.fn().mockResolvedValue(),
    };
    await prepareTrack(track);
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: 'continuous' }] });
  });

  test('reports torch and a 2x zoom only when the camera has them', async () => {
    const plain = { getCapabilities: () => ({}), getSettings: () => ({}) };
    expect(await prepareTrack(plain)).toEqual({ torch: false, zoom: null });

    const capable = {
      getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 8, step: 0.1 } }),
      getSettings: () => ({ zoom: 1 }),
    };
    expect(await prepareTrack(capable)).toEqual({ torch: true, zoom: { base: 1, close: 2 } });

    // iPhone Safari has no getCapabilities on older versions at all.
    expect(await prepareTrack({})).toEqual({ torch: false, zoom: null });
  });

  test('offers no zoom when the camera can barely zoom', async () => {
    const track = { getCapabilities: () => ({ zoom: { min: 1, max: 1.2 } }), getSettings: () => ({ zoom: 1 }) };
    expect((await prepareTrack(track)).zoom).toBeNull();
  });
});
