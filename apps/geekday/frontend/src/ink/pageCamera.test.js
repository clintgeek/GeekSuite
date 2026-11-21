import { describe, it, expect, vi } from 'vitest';
import { PAPER_PAGE, PAPER_RULE } from '@geeksuite/ui';
import {
  PAGE_WIDTH, SHEET_HEIGHT, RULE_SPACING, MIN_SHEETS, MAX_ZOOM_FACTOR,
  pageZoom, fitZoom, pageHeightFor, clampCamera, topOfPage, isZoomedIn, panCamera, zoomCamera, fitCamera,
  cameraAfterResize, clientToPage, pageBoxToPane, setPageCamera,
} from './pageCamera';

const PANE = { left: 0, top: 0, width: 500, height: 1000 }; // fit zoom 0.5: 2000 page units of height on screen
const THREE = SHEET_HEIGHT * 3;

describe('the page', () => {
  it('is the shared sheet: 1000 wide, 1400 to the sheet, ruled at 48', () => {
    expect(PAGE_WIDTH).toBe(PAPER_PAGE.width);
    expect(SHEET_HEIGHT).toBe(PAPER_PAGE.height);
    expect(RULE_SPACING).toBe(PAPER_RULE);
    expect(MIN_SHEETS).toBe(3);
  });

  it('fit zoom makes 1000 page units span the container', () => {
    expect(pageZoom(800)).toBeCloseTo(0.8);
    expect(fitZoom(1200)).toBeCloseTo(1.2);
    expect(pageZoom(0)).toBe(1);
    expect(pageZoom(undefined)).toBe(1);
  });

  it('is at least three sheets tall, and always has a whole sheet below the lowest ink', () => {
    expect(pageHeightFor(0)).toBe(THREE);
    expect(pageHeightFor(undefined)).toBe(THREE);
    expect(pageHeightFor(NaN)).toBe(THREE);
    expect(pageHeightFor(-50)).toBe(THREE);
    expect(pageHeightFor(1400)).toBe(THREE); // ink fills sheet one: sheets two and three are free
    expect(pageHeightFor(2800)).toBe(THREE); // ink to the foot of sheet two: sheet three is free
    expect(pageHeightFor(2801)).toBe(SHEET_HEIGHT * 4); // ink on sheet three: a fourth
    expect(pageHeightFor(4200)).toBe(SHEET_HEIGHT * 4);
    expect(pageHeightFor(9000)).toBe(SHEET_HEIGHT * 8);
    for (const bottom of [0, 1, 1399, 1400, 1401, 2800, 5000, 6999, 7000]) {
      const h = pageHeightFor(bottom);
      expect(h % SHEET_HEIGHT).toBe(0);
      expect(h - bottom).toBeGreaterThanOrEqual(SHEET_HEIGHT);
    }
  });

  it('is never shorter than one screen at the fit zoom', () => {
    // 300 px wide, 1500 tall: zoom 0.3, so the screen shows 5000 page units.
    expect(pageHeightFor(0, { width: 300, height: 1500 })).toBe(SHEET_HEIGHT * 4);
    expect(pageHeightFor(0, PANE)).toBe(THREE);
  });
});

describe('clampCamera', () => {
  it('never zooms out past fit, and at fit the page cannot sit to the side', () => {
    expect(clampCamera({ x: -300, y: -100, z: 0.2 }, PANE, THREE)).toEqual({ x: 0, y: -100, z: 0.5 });
    expect(clampCamera({ x: 120, y: -100, z: 0.5 }, PANE, THREE)).toEqual({ x: 0, y: -100, z: 0.5 });
    expect(Object.is(clampCamera({ x: -0, y: -0, z: 0.5 }, PANE, THREE).x, 0)).toBe(true);
  });

  it('never zooms in past three times fit', () => {
    expect(MAX_ZOOM_FACTOR).toBe(3);
    expect(clampCamera({ x: 0, y: 0, z: 9 }, PANE, THREE).z).toBeCloseTo(1.5);
  });

  it('keeps the view on the page: not above the top, not past the foot, not past either side', () => {
    expect(clampCamera({ x: 0, y: 40, z: 0.5 }, PANE, THREE).y).toBe(0);
    // At fit the screen shows 2000 units of a 4200 page: the furthest scroll is 2200.
    expect(clampCamera({ x: 0, y: -9999, z: 0.5 }, PANE, THREE).y).toBe(-2200);
    // Zoomed to 1: the screen shows 500 x 1000 units.
    expect(clampCamera({ x: 50, y: 0, z: 1 }, PANE, THREE).x).toBe(0);
    expect(clampCamera({ x: -9999, y: -9999, z: 1 }, PANE, THREE)).toEqual({ x: -500, y: -3200, z: 1 });
    expect(clampCamera({ x: -250, y: -700, z: 1 }, PANE, THREE)).toEqual({ x: -250, y: -700, z: 1 });
  });

  it('a taller page scrolls further', () => {
    expect(clampCamera({ x: 0, y: -9999, z: 0.5 }, PANE, SHEET_HEIGHT * 4).y).toBe(-3600);
  });

  it('survives nonsense', () => {
    expect(clampCamera({ x: NaN, y: undefined, z: NaN }, PANE, THREE)).toEqual({ x: 0, y: 0, z: 0.5 });
    expect(clampCamera(null, PANE, undefined)).toEqual({ x: 0, y: 0, z: 0.5 });
  });
});

describe('moving the camera', () => {
  it('a day opens at the top, zoomed out', () => {
    expect(topOfPage(PANE)).toEqual({ x: 0, y: 0, z: 0.5 });
    expect(isZoomedIn(topOfPage(PANE), PANE)).toBe(false);
  });

  it('knows zoomed in from zoomed out (with a hair of tolerance)', () => {
    expect(isZoomedIn({ x: 0, y: 0, z: 0.505 }, PANE)).toBe(false);
    expect(isZoomedIn({ x: 0, y: 0, z: 0.6 }, PANE)).toBe(true);
  });

  it('a drag moves the page by that many screen pixels, and stops at the edges', () => {
    expect(panCamera({ x: 0, y: -400, z: 0.5 }, 0, -100, PANE, THREE)).toEqual({ x: 0, y: -600, z: 0.5 });
    expect(panCamera({ x: 0, y: -400, z: 0.5 }, 80, 0, PANE, THREE).x).toBe(0); // zoomed out: no sideways
    expect(panCamera({ x: 0, y: -100, z: 0.5 }, 0, 5000, PANE, THREE).y).toBe(0);
    expect(panCamera({ x: -200, y: -400, z: 1 }, -50, 30, PANE, THREE)).toEqual({ x: -250, y: -370, z: 1 });
  });

  it('zooming keeps the page point under the fingers under the fingers', () => {
    const before = { x: 0, y: -400, z: 0.5 };
    const at = { x: 250, y: 500 };
    const under = clientToPage(at.x, at.y, PANE, before);
    const after = zoomCamera(before, 1, at, at, PANE, THREE);
    expect(after.z).toBe(1);
    const still = clientToPage(at.x, at.y, PANE, after);
    expect(still.x).toBeCloseTo(under.x);
    expect(still.y).toBeCloseTo(under.y);
    // The fingers also moved: the point follows them.
    const to = { x: 300, y: 450 };
    const moved = zoomCamera(before, 1, at, to, PANE, THREE);
    const followed = clientToPage(to.x, to.y, PANE, moved);
    expect(followed.x).toBeCloseTo(under.x);
    expect(followed.y).toBeCloseTo(under.y);
  });

  it('zooming stops at fit and at three times fit, clamped to the page', () => {
    const at = { x: 400, y: 100 };
    expect(zoomCamera({ x: -300, y: -50, z: 1 }, 0.1, at, at, PANE, THREE)).toEqual({ x: 0, y: -0 + 0, z: 0.5 });
    expect(zoomCamera({ x: 0, y: 0, z: 0.5 }, 50, at, at, PANE, THREE).z).toBeCloseTo(1.5);
  });

  it('Fit goes back to the whole width and keeps the top of the view', () => {
    expect(fitCamera({ x: -300, y: -900, z: 1.2 }, PANE, THREE)).toEqual({ x: 0, y: -900, z: 0.5 });
    expect(fitCamera({ x: -300, y: -4000, z: 1.5 }, PANE, THREE)).toEqual({ x: 0, y: -2200, z: 0.5 });
  });

  it('a resized pane keeps the top-left page point and the zoom as a multiple of fit', () => {
    const wide = { left: 0, top: 0, width: 1000, height: 1000 };
    // Zoomed out: stays zoomed out at the new width, same line at the top.
    expect(cameraAfterResize({ x: 0, y: -900, z: 0.5 }, PANE, wide, THREE)).toEqual({ x: 0, y: -900, z: 1 });
    // Zoomed to twice fit: still twice fit.
    expect(cameraAfterResize({ x: -200, y: -900, z: 1 }, PANE, wide, THREE)).toEqual({ x: -200, y: -900, z: 2 });
    // And re-clamped: a shorter, wider pane cannot show past the foot.
    const short = { left: 0, top: 0, width: 500, height: 2000 };
    expect(cameraAfterResize({ x: 0, y: -2200, z: 0.5 }, PANE, short, THREE)).toEqual({ x: 0, y: -200, z: 0.5 });
  });
});

describe('page and screen', () => {
  it('a client point is a page point through the live camera', () => {
    const rect = { left: 100, top: 50, width: 800, height: 900 };
    // No camera: the top of the page at fit.
    expect(clientToPage(100 + 400, 50 + 80, rect)).toEqual({ x: 500, y: 100 });
    // Scrolled 1000 units down.
    expect(clientToPage(500, 130, rect, { x: 0, y: -1000, z: 0.8 })).toEqual({ x: 500, y: 1100 });
    // Scrolled and zoomed in.
    expect(clientToPage(500, 130, rect, { x: -200, y: -1000, z: 1.6 })).toEqual({ x: 450, y: 1050 });
  });

  it('a page box is a screen box through the same camera', () => {
    expect(pageBoxToPane({ x: 450, y: 1050, w: 100, h: 20 }, { x: -200, y: -1000, z: 1.6 })).toEqual({ x: 400, y: 80, w: 160, h: 32 });
  });
});

describe('setPageCamera', () => {
  const make = (camera = { x: 5, y: 5, z: 1 }, options = { isLocked: false }) => {
    const editor = {
      camera,
      options,
      getCamera: () => editor.camera,
      getCameraOptions: () => editor.options,
      setCameraOptions: vi.fn((o) => { editor.options = { ...editor.options, ...o }; }),
      setCamera: vi.fn((c) => { editor.camera = c; }),
    };
    return editor;
  };

  it('locks tldraw\'s own camera and forces ours', () => {
    const editor = make();
    setPageCamera(editor, { x: 0, y: -300, z: 0.5 });
    expect(editor.setCameraOptions).toHaveBeenCalledWith({ isLocked: true, wheelBehavior: 'none' });
    expect(editor.setCamera).toHaveBeenCalledWith({ x: 0, y: -300, z: 0.5 }, { force: true });
  });

  it('does nothing when the camera is already there, or there is no editor', () => {
    const editor = make({ x: 0, y: -300, z: 0.5 }, { isLocked: true });
    setPageCamera(editor, { x: 0, y: -300, z: 0.5 });
    expect(editor.setCamera).not.toHaveBeenCalled();
    expect(editor.setCameraOptions).not.toHaveBeenCalled();
    expect(() => setPageCamera(null, { x: 0, y: 0, z: 1 })).not.toThrow();
    expect(() => setPageCamera({ isDisposed: true }, { x: 0, y: 0, z: 1 })).not.toThrow();
  });
});
