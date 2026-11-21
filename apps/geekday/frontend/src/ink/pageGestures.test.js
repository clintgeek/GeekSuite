import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachPageGestures, PEN_NEAR_MS } from './pageGestures';
import { SHEET_HEIGHT } from './pageCamera';

const PANE = { left: 100, top: 50, width: 500, height: 1000 }; // fit zoom 0.5
const HEIGHT = SHEET_HEIGHT * 3;

function setup({ fingerPans = true, camera = { x: 0, y: -1000, z: 0.5 } } = {}) {
  const el = document.createElement('div');
  const canvas = document.createElement('div');
  canvas.className = 'tl-canvas';
  const bar = document.createElement('div');
  el.append(canvas, bar);
  document.body.append(el);
  const state = { camera, fingerPans, clock: 1000, frames: [] };
  const detach = attachPageGestures(el, {
    getCamera: () => state.camera,
    setCamera: (c) => { state.camera = c; },
    getViewport: () => PANE,
    getPageHeight: () => HEIGHT,
    fingerPans: () => state.fingerPans,
  }, {
    now: () => state.clock,
    raf: (fn) => { state.frames.push(fn); return state.frames.length; },
    caf: (id) => { state.frames[id - 1] = null; },
  });
  const fire = (target, type, { pointerId = 1, pointerType = 'touch', ...init } = {}) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: 0, ...init });
    Object.defineProperty(e, 'pointerId', { value: pointerId });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    target.dispatchEvent(e);
    return e;
  };
  const down = (id, x, y, type = 'touch', target = canvas) => fire(target, 'pointerdown', { pointerId: id, pointerType: type, clientX: x, clientY: y });
  const move = (id, x, y, type = 'touch') => fire(window, 'pointermove', { pointerId: id, pointerType: type, clientX: x, clientY: y });
  const up = (id, x = 0, y = 0, type = 'touch') => fire(window, 'pointerup', { pointerId: id, pointerType: type, clientX: x, clientY: y });
  const wheel = (init, target = canvas) => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 350, clientY: 550, ...init });
    target.dispatchEvent(e);
    return e;
  };
  /** Run queued animation frames, `ms` apart. */
  const frames = (count, ms = 16) => {
    for (let i = 0; i < count; i++) {
      const fn = state.frames.find(Boolean);
      if (!fn) return i;
      state.frames[state.frames.indexOf(fn)] = null;
      state.clock += ms;
      fn();
    }
    return count;
  };
  return { el, canvas, bar, state, detach, down, move, up, wheel, frames, fire };
}

describe('page gestures', () => {
  let t;
  beforeEach(() => { t = null; });
  afterEach(() => { t?.detach(); document.body.innerHTML = ''; });

  it('the wheel scrolls the page, and the browser does not get it', () => {
    t = setup();
    const e = t.wheel({ deltaY: 100 });
    expect(t.state.camera).toEqual({ x: 0, y: -1200, z: 0.5 });
    expect(e.defaultPrevented).toBe(true);
    t.wheel({ deltaY: -100000 });
    expect(t.state.camera.y).toBe(0); // clamped at the top
    t.wheel({ deltaX: 300 });
    expect(t.state.camera.x).toBe(0); // zoomed out: no sideways
    t.wheel({ deltaY: 3, deltaMode: 1 }); // three lines
    expect(t.state.camera.y).toBe(-96);
  });

  it('Ctrl + wheel (a trackpad pinch) zooms at the pointer, between fit and three times fit', () => {
    t = setup();
    const under = { x: (350 - 100) / 0.5, y: (550 - 50) / 0.5 + 1000 };
    t.wheel({ deltaY: -30, ctrlKey: true });
    const { x, y, z } = t.state.camera;
    expect(z).toBeCloseTo(0.5 * Math.exp(0.3));
    expect((350 - 100) / z - x).toBeCloseTo(under.x);
    expect((550 - 50) / z - y).toBeCloseTo(under.y);
    for (let i = 0; i < 10; i++) t.wheel({ deltaY: -100, metaKey: true });
    expect(t.state.camera.z).toBeCloseTo(1.5);
    for (let i = 0; i < 10; i++) t.wheel({ deltaY: 100, ctrlKey: true });
    expect(t.state.camera).toMatchObject({ x: 0, z: 0.5 });
  });

  it('Shift + wheel scrolls sideways once zoomed in; a wheel over the toolbar is left alone', () => {
    t = setup({ camera: { x: -100, y: -1000, z: 1 } });
    t.wheel({ deltaY: 50, shiftKey: true });
    expect(t.state.camera).toEqual({ x: -150, y: -1000, z: 1 });
    const e = t.wheel({ deltaY: 50 }, t.bar);
    expect(e.defaultPrevented).toBe(false);
    expect(t.state.camera.y).toBe(-1000);
  });

  it('one finger pans when fingers do not draw, after a small slop and without a jump', () => {
    t = setup();
    t.down(1, 300, 600);
    t.move(1, 300, 596); // inside the slop
    expect(t.state.camera.y).toBe(-1000);
    t.move(1, 300, 590); // through it: the pan starts here
    expect(t.state.camera.y).toBe(-1000);
    t.move(1, 310, 540);
    expect(t.state.camera).toEqual({ x: 0, y: -1100, z: 0.5 }); // 50 px at zoom 0.5; no sideways at fit
    t.up(1, 310, 540);
  });

  it('one finger does not move the page when fingers draw', () => {
    t = setup({ fingerPans: false });
    t.down(1, 300, 600);
    t.move(1, 300, 500);
    t.move(1, 300, 400);
    t.up(1, 300, 400);
    expect(t.state.camera).toEqual({ x: 0, y: -1000, z: 0.5 });
  });

  it('two fingers always pan, even when fingers draw; the finger left behind keeps panning', () => {
    t = setup({ fingerPans: false });
    t.down(1, 250, 600);
    t.down(2, 350, 600);
    t.move(1, 250, 580); // through the slop: the gesture starts with the midpoint at 590
    t.move(2, 350, 580);
    t.move(1, 250, 480);
    t.move(2, 350, 480);
    expect(t.state.camera.z).toBe(0.5);
    expect(t.state.camera.y).toBeCloseTo(-1220); // the midpoint moved 110 px up
    t.up(2, 350, 480);
    t.move(1, 250, 460); // slop again from where it is
    t.move(1, 250, 410);
    expect(t.state.camera.y).toBeCloseTo(-1320);
    t.up(1, 250, 410);
    // A new single finger is a writing finger again.
    t.down(3, 250, 600);
    t.move(3, 250, 400);
    expect(t.state.camera.y).toBeCloseTo(-1320);
  });

  it('two fingers spreading zoom in about their midpoint; pinching cannot go below fit', () => {
    t = setup();
    t.down(1, 250, 600);
    t.down(2, 350, 600);
    t.move(1, 230, 600); // through the slop: the gesture starts 120 apart, midpoint 290
    const mid = { x: (290 - 100) / 0.5, y: (600 - 50) / 0.5 + 1000 };
    t.move(2, 370, 600);
    t.move(1, 180, 600);
    t.move(2, 420, 600); // 240 apart: twice, midpoint 300
    const { x, y, z } = t.state.camera;
    expect(z).toBeCloseTo(1);
    expect((300 - 100) / z - x).toBeCloseTo(mid.x);
    expect((600 - 50) / z - y).toBeCloseTo(mid.y);
    t.move(1, 290, 600);
    t.move(2, 310, 600); // nearly together
    t.move(1, 270, 600);
    t.move(2, 330, 600);
    t.up(1); t.up(2);
    t.down(1, 100 + 50, 600);
    t.down(2, 100 + 450, 600);
    t.move(1, 100 + 70, 600);
    t.move(2, 100 + 430, 600);
    for (let i = 0; i < 12; i++) { t.move(1, 100 + 90 + i * 10, 600); t.move(2, 100 + 410 - i * 10, 600); }
    expect(t.state.camera.z).toBe(0.5);
    expect(t.state.camera.x).toBe(0);
  });

  it('a two-finger tap does not move the page', () => {
    t = setup();
    t.down(1, 250, 600);
    t.down(2, 350, 600);
    t.move(1, 252, 601);
    t.move(2, 349, 602);
    t.up(1); t.up(2);
    expect(t.state.camera).toEqual({ x: 0, y: -1000, z: 0.5 });
  });

  it('the pen and the mouse never move the page', () => {
    t = setup();
    t.down(1, 300, 600, 'pen');
    t.move(1, 300, 400, 'pen');
    t.up(1, 300, 400, 'pen');
    t.down(1, 300, 600, 'mouse');
    t.move(1, 300, 400, 'mouse');
    t.up(1, 300, 400, 'mouse');
    expect(t.state.camera).toEqual({ x: 0, y: -1000, z: 0.5 });
  });

  it('a touch that lands while the pen is down is the writing hand: it never moves the page, even after the pen lifts', () => {
    t = setup();
    t.down(9, 200, 500, 'pen');
    t.down(1, 400, 800);
    t.move(1, 400, 700);
    t.up(9, 200, 500, 'pen');
    t.state.clock += 5000;
    t.move(1, 400, 600);
    t.move(1, 400, 500);
    expect(t.state.camera.y).toBe(-1000);
    t.up(1);
    // Lifted and put down again with the pen away: a finger.
    t.down(1, 400, 800);
    t.move(1, 400, 780);
    t.move(1, 400, 700);
    expect(t.state.camera.y).toBe(-1160);
  });

  it('a touch that lands while the pen is hovering is the hand too; once the pen has gone it is a finger', () => {
    t = setup();
    t.move(9, 200, 500, 'pen'); // hovering
    t.state.clock += PEN_NEAR_MS - 1;
    t.down(1, 400, 800);
    t.move(1, 400, 700);
    t.move(1, 400, 600);
    expect(t.state.camera.y).toBe(-1000);
    t.up(1);
    t.state.clock += PEN_NEAR_MS + 1;
    t.down(1, 400, 800);
    t.move(1, 400, 780);
    t.move(1, 400, 700);
    expect(t.state.camera.y).toBe(-1160);
  });

  it('a finger that is panning stops the moment the pen touches the glass', () => {
    t = setup();
    t.down(1, 400, 800);
    t.move(1, 400, 780);
    t.move(1, 400, 700);
    expect(t.state.camera.y).toBe(-1160);
    t.down(9, 200, 500, 'pen');
    t.move(1, 400, 600);
    t.move(1, 400, 500);
    t.up(1, 400, 500);
    expect(t.state.camera.y).toBe(-1160);
    expect(t.frames(5)).toBe(0); // and no flick
  });

  it('a flick carries the page on, slows, and stops; a slow lift does not', () => {
    t = setup();
    t.down(1, 300, 800);
    for (let i = 1; i <= 6; i++) { t.state.clock += 10; t.move(1, 300, 800 - i * 30); } // 3 px/ms
    const lifted = t.state.camera.y;
    t.up(1, 300, 620);
    expect(t.frames(1)).toBe(1);
    expect(t.state.camera.y).toBeLessThan(lifted - 50);
    const ran = t.frames(600);
    expect(ran).toBeGreaterThan(5);
    expect(ran).toBeLessThan(600); // it stopped on its own
    const rest = t.state.camera.y;
    expect(rest).toBeLessThan(lifted - 200);
    expect(rest).toBeGreaterThanOrEqual(-2200);

    t.down(1, 300, 800);
    for (let i = 1; i <= 6; i++) { t.state.clock += 100; t.move(1, 300, 800 - i * 10); } // 0.1 px/ms
    t.up(1, 300, 740);
    expect(t.frames(5)).toBe(0);
  });

  it('a touch stops a flick; so does the wheel', () => {
    t = setup();
    const flick = () => {
      t.down(1, 300, 800);
      for (let i = 1; i <= 6; i++) { t.state.clock += 10; t.move(1, 300, 800 - i * 30); }
      t.up(1, 300, 620);
      t.frames(2);
    };
    flick();
    t.down(2, 300, 500);
    expect(t.frames(5)).toBe(0);
    t.up(2);
    t.wheel({ deltaY: -100000 });
    flick();
    const at = t.state.camera.y;
    t.wheel({ deltaY: 10 });
    expect(t.frames(5)).toBe(0);
    expect(t.state.camera.y).toBe(at - 20);
  });

  it('a touch that starts on the toolbar does not move the page', () => {
    t = setup();
    t.down(1, 300, 600, 'touch', t.bar);
    t.move(1, 300, 400);
    expect(t.state.camera.y).toBe(-1000);
  });

  it('detach removes every listener', () => {
    t = setup();
    t.detach();
    t.wheel({ deltaY: 100 });
    t.down(1, 300, 600);
    t.move(1, 300, 400);
    expect(t.state.camera).toEqual({ x: 0, y: -1000, z: 0.5 });
  });
});
