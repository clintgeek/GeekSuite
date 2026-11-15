/**
 * sketchImages — an inserted or pasted image is shrunk, and refused BY NAME
 * when it would make the sketch unsaveable (review 1.18).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  prepareSketchImage, sketchImageHandler, SKETCH_IMAGE_MAX_EDGE, SKETCH_IMAGE_MAX_CHARS,
} from '../../utils/sketchImages';
import { SNAPSHOT_CONTENT_MAX } from '../../utils/saveGuards';

/** A canvas stand-in: toDataURL returns `chars` characters for the drawn size. */
function fakeCanvas(charsFor) {
  const drawn = [];
  const canvas = {
    width: 0, height: 0, drawn,
    getContext: () => ({ fillRect() {}, clearRect() {}, set fillStyle(_v) {}, drawImage: (_img, x, y, w, h) => drawn.push([w, h]) }),
    toDataURL: (type) => `data:${type};base64,${'A'.repeat(charsFor(canvas.width, canvas.height, type))}`,
  };
  return canvas;
}
const photo = (name = 'IMG_2041.jpg', type = 'image/jpeg') => new File(['x'], name, { type });

describe('prepareSketchImage', () => {
  it('scales a camera photo down to 1600px on its longest edge', async () => {
    const canvas = fakeCanvas(() => 400_000);
    const out = await prepareSketchImage(photo(), {
      loadImage: async () => ({ width: 4000, height: 3000 }),
      createCanvas: () => canvas,
    });
    expect(SKETCH_IMAGE_MAX_EDGE).toBe(1600);
    expect([out.width, out.height]).toEqual([1600, 1200]);
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.dataUrl.startsWith('data:image/jpeg')).toBe(true);
  });

  it('never scales a small image up', async () => {
    const out = await prepareSketchImage(photo('icon.png', 'image/png'), {
      loadImage: async () => ({ width: 300, height: 200 }),
      createCanvas: () => fakeCanvas(() => 20_000),
    });
    expect([out.width, out.height, out.mimeType]).toEqual([300, 200, 'image/png']);
  });

  it('refuses, by name, an image still too big after shrinking', async () => {
    await expect(prepareSketchImage(photo('panorama.jpg'), {
      loadImage: async () => ({ width: 1600, height: 1600 }),
      createCanvas: () => fakeCanvas(() => SKETCH_IMAGE_MAX_CHARS + 10),
    })).rejects.toMatchObject({ code: 'too_big', message: expect.stringContaining('“panorama.jpg”') });
  });

  it('refuses, by name, an image that would push the sketch past what can be saved — before inserting it', async () => {
    await expect(prepareSketchImage(photo('whiteboard.jpg'), {
      currentChars: SNAPSHOT_CONTENT_MAX - 100_000,
      loadImage: async () => ({ width: 1600, height: 1200 }),
      createCanvas: () => fakeCanvas(() => 400_000),
    })).rejects.toMatchObject({ code: 'sketch_full', message: expect.stringMatching(/^“whiteboard\.jpg” would make this sketch too large to save/) });
  });

  it('a file that is not an image, or will not decode, is named too', async () => {
    await expect(prepareSketchImage(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).rejects.toThrow('“notes.pdf” is not an image');
    await expect(prepareSketchImage(photo('IMG_1.heic', 'image/heic'), { loadImage: async () => { throw new Error('nope'); } }))
      .rejects.toThrow('“IMG_1.heic” could not be opened');
  });
});

describe('sketchImageHandler', () => {
  const AssetRecordType = { createId: () => 'asset:new', create: (r) => r };

  it('makes an image asset from the shrunk copy', async () => {
    const handler = sketchImageHandler({
      currentChars: () => 1000,
      onRefuse: vi.fn(),
      AssetRecordType,
      prepare: async () => ({ dataUrl: 'data:image/jpeg;base64,QUJD', width: 1600, height: 1200, mimeType: 'image/jpeg' }),
    });
    const asset = await handler({ file: photo() });
    expect(asset).toMatchObject({ id: 'asset:new', type: 'image', props: { name: 'IMG_2041.jpg', src: 'data:image/jpeg;base64,QUJD', w: 1600, h: 1200, mimeType: 'image/jpeg' } });
  });

  it('several images dropped at once count each other', async () => {
    const seen = [];
    const handler = sketchImageHandler({
      currentChars: () => 1000,
      onRefuse: vi.fn(),
      AssetRecordType,
      prepare: async (_f, { currentChars }) => { seen.push(currentChars); return { dataUrl: 'x'.repeat(500), width: 1, height: 1, mimeType: 'image/jpeg' }; },
    });
    await handler({ file: photo('a.jpg') });
    await handler({ file: photo('b.jpg') });
    expect(seen).toEqual([1000, 1500]);
  });

  it('says why it refused, then throws so tldraw inserts nothing', async () => {
    const onRefuse = vi.fn();
    const handler = sketchImageHandler({ currentChars: () => 0, onRefuse, AssetRecordType });
    await expect(handler({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) })).rejects.toThrow();
    expect(onRefuse).toHaveBeenCalledWith('“a.txt” is not an image, so it can\'t go in a sketch.');
  });
});
