/**
 * Preparing photographed pages (DOCS/HANDWRITING.md §3.3): EXIF orientation,
 * rotation, downscaling, the JPEG encode, the page limit, the transcript
 * join. jsdom has no canvas or image decoder, so both are fakes that record
 * what they were asked to do.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  normalizeRotation,
  rotateBy,
  rotatedSize,
  preparedGeometry,
  acceptPages,
  joinPageTranscripts,
  photoNoteTitle,
  decodePhoto,
  preparePhotoPage,
  undecodableMessage,
  PhotoPageError,
  PHOTO_MAX_PAGES,
  PHOTO_MAX_EDGE,
  PHOTO_JPEG_QUALITY,
} from '../../utils/photoPages';

describe('rotation', () => {
  it('normalises to quarter turns, clockwise', () => {
    expect([0, 90, 180, 270, 360, 450, -90, -180, 89, 46].map(normalizeRotation)).toEqual([0, 90, 180, 270, 0, 90, 270, 180, 90, 90]);
  });

  it('turns a quarter at a time and wraps', () => {
    expect(rotateBy(0)).toBe(90);
    expect(rotateBy(270)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
  });

  it('swaps width and height on a quarter turn only', () => {
    expect(rotatedSize(3000, 4000, 0)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(3000, 4000, 90)).toEqual({ width: 4000, height: 3000 });
    expect(rotatedSize(3000, 4000, 180)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(3000, 4000, 270)).toEqual({ width: 4000, height: 3000 });
  });
});

describe('downscaling', () => {
  it('fits the longest edge to 2000px, keeping the aspect', () => {
    expect(PHOTO_MAX_EDGE).toBe(2000);
    expect(preparedGeometry(3000, 4000, 0).canvas).toEqual({ width: 1500, height: 2000 });
    expect(preparedGeometry(4000, 3000, 0).canvas).toEqual({ width: 2000, height: 1500 });
  });

  it('never scales up', () => {
    expect(preparedGeometry(800, 600, 0).canvas).toEqual({ width: 800, height: 600 });
  });

  it('turns after scaling: a 4000×3000 photo turned 90° is 1500×2000', () => {
    const g = preparedGeometry(4000, 3000, 90);
    expect(g.draw).toEqual({ width: 2000, height: 1500 });
    expect(g.canvas).toEqual({ width: 1500, height: 2000 });
  });
});

describe('the page limit', () => {
  it('is 8', () => expect(PHOTO_MAX_PAGES).toBe(8));

  it('accepts up to the limit and says what it left out', () => {
    expect(acceptPages(0, 3)).toEqual({ accepted: 3, refused: 0, message: null });
    expect(acceptPages(6, 3)).toMatchObject({ accepted: 2, refused: 1, message: expect.stringMatching(/up to 8 pages.*last photo was not added/) });
    expect(acceptPages(5, 6)).toMatchObject({ accepted: 3, refused: 3, message: expect.stringMatching(/last 3 photos were/) });
    expect(acceptPages(8, 1)).toMatchObject({ accepted: 0, refused: 1, message: expect.stringMatching(/Remove one/) });
  });
});

describe('the transcript', () => {
  it('one page is its text alone', () => {
    expect(joinPageTranscripts(['milk\neggs\n'])).toBe('milk\neggs');
  });

  it('several pages are marked "--- page N ---", in order', () => {
    expect(joinPageTranscripts(['first', 'second', 'third'])).toBe(
      '--- page 1 ---\nfirst\n\n--- page 2 ---\nsecond\n\n--- page 3 ---\nthird'
    );
  });
});

describe('the photo note title', () => {
  it('is the writer\'s, or "Photos · <date>"', () => {
    expect(photoNoteTitle('  Kitchen plans ')).toBe('Kitchen plans');
    expect(photoNoteTitle('', new Date(2026, 8, 27, 12))).toBe('Photos · 27 Sep 2026');
  });
});

// ── Decoding ────────────────────────────────────────────────────────────────

const file = (name = 'page.jpg', type = 'image/jpeg') => ({ name, type });
const bitmap = (width, height) => ({ width, height, close: vi.fn() });

describe('decodePhoto', () => {
  it('asks createImageBitmap to honour the EXIF orientation', async () => {
    const createBitmap = vi.fn(async () => bitmap(3000, 4000));
    const f = file();
    await decodePhoto(f, { createBitmap, loadImage: vi.fn() });
    expect(createBitmap).toHaveBeenCalledWith(f, { imageOrientation: 'from-image' });
  });

  it('retries without the options bag when a browser rejects it', async () => {
    const createBitmap = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to read the 'imageOrientation' property"))
      .mockResolvedValueOnce(bitmap(10, 10));
    const loadImage = vi.fn();
    const out = await decodePhoto(file(), { createBitmap, loadImage });
    expect(out.width).toBe(10);
    expect(createBitmap).toHaveBeenCalledTimes(2);
    expect(createBitmap.mock.calls[1]).toHaveLength(1);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('falls back to an <img> when there is no createImageBitmap, or it cannot decode', async () => {
    const img = { width: 5, height: 5 };
    expect(await decodePhoto(file(), { createBitmap: null, loadImage: async () => img })).toBe(img);
    const decodeFail = Object.assign(new Error('The source image could not be decoded.'), { name: 'InvalidStateError' });
    expect(await decodePhoto(file(), { createBitmap: async () => { throw decodeFail; }, loadImage: async () => img })).toBe(img);
  });

  it('says so plainly when nothing can read it, naming HEIC when it is one', async () => {
    const fail = async () => { throw new Error('nope'); };
    let caught;
    try {
      await decodePhoto(file('IMG_0001.HEIC', 'image/heic'), { createBitmap: fail, loadImage: fail });
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(PhotoPageError);
    expect(caught.code).toBe('decode');
    expect(caught.message).toMatch(/can't open HEIC photos \(IMG_0001\.HEIC\)/);
    expect(undecodableMessage(file('x.tiff', 'image/tiff'))).toMatch(/can't open that image \(x\.tiff\)\. Try a JPEG or PNG/);
  });
});

// ── Preparing ───────────────────────────────────────────────────────────────

function fakeCanvas() {
  const ops = [];
  const ctx = {
    set fillStyle(v) { ops.push(['fillStyle', v]); },
    set imageSmoothingEnabled(v) { ops.push(['smoothing', v]); },
    set imageSmoothingQuality(v) { ops.push(['smoothingQuality', v]); },
    fillRect: (...a) => ops.push(['fillRect', ...a]),
    translate: (...a) => ops.push(['translate', ...a]),
    rotate: (a) => ops.push(['rotate', a]),
    drawImage: (img, ...a) => ops.push(['drawImage', ...a]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: vi.fn((cb, type, quality) => cb({ size: 512_000, type, quality })),
  };
  return { canvas, ops };
}

describe('preparePhotoPage', () => {
  it('scales a 4000×3000 photo into 2000×1500, on white, as JPEG 0.85', async () => {
    const { canvas, ops } = fakeCanvas();
    const img = bitmap(4000, 3000);
    const out = await preparePhotoPage(file(), 0, {
      decode: async () => img,
      createCanvas: () => canvas,
      toBase64: async () => 'AAAA',
    });
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1500);
    expect(ops).toContainEqual(['fillStyle', '#ffffff']);
    expect(ops).toContainEqual(['fillRect', 0, 0, 2000, 1500]);
    expect(ops).toContainEqual(['rotate', 0]);
    expect(ops).toContainEqual(['drawImage', -1000, -750, 2000, 1500]);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', PHOTO_JPEG_QUALITY);
    expect(PHOTO_JPEG_QUALITY).toBe(0.85);
    expect(img.close).toHaveBeenCalled();
    expect(out).toMatchObject({ width: 2000, height: 1500, bytes: 512_000, base64: 'AAAA', dataUrl: 'data:image/jpeg;base64,AAAA' });
  });

  it('turns the page: 90° makes a landscape shot portrait, about the canvas centre', async () => {
    const { canvas, ops } = fakeCanvas();
    const out = await preparePhotoPage(file(), 90, {
      decode: async () => bitmap(4000, 3000),
      createCanvas: () => canvas,
      toBase64: async () => 'AAAA',
    });
    expect(out).toMatchObject({ width: 1500, height: 2000 });
    expect(ops).toContainEqual(['translate', 750, 1000]);
    expect(ops).toContainEqual(['rotate', Math.PI / 2]);
    // Drawn at its scaled, unturned size, centred on the origin.
    expect(ops).toContainEqual(['drawImage', -1000, -750, 2000, 1500]);
  });

  it('180° and 270° turn the same way', async () => {
    for (const [r, size] of [[180, [2000, 1500]], [270, [1500, 2000]]]) {
      const { canvas, ops } = fakeCanvas();
      await preparePhotoPage(file(), r, { decode: async () => bitmap(4000, 3000), createCanvas: () => canvas, toBase64: async () => 'A' });
      expect([canvas.width, canvas.height]).toEqual(size);
      expect(ops).toContainEqual(['rotate', (r * Math.PI) / 180]);
    }
  });

  it('works from the decoded (EXIF-upright) size, not the file\'s stored one', async () => {
    // A phone stores a portrait shot as 4000×3000 plus "rotate 90". Decoded
    // with imageOrientation: 'from-image' it is 3000×4000, and that is what
    // is prepared: portrait, with no turn of our own.
    const { canvas } = fakeCanvas();
    const decode = vi.fn(async () => bitmap(3000, 4000));
    const out = await preparePhotoPage(file(), 0, { decode, createCanvas: () => canvas, toBase64: async () => 'A' });
    expect(out).toMatchObject({ width: 1500, height: 2000 });
  });

  it('a failed encode is an error, not an empty page', async () => {
    const { canvas } = fakeCanvas();
    canvas.toBlob = (cb) => cb(null);
    await expect(preparePhotoPage(file(), 0, { decode: async () => bitmap(10, 10), createCanvas: () => canvas, toBase64: async () => 'A' }))
      .rejects.toMatchObject({ code: 'encode' });
  });
});
