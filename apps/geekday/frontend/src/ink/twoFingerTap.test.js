/** Two fingers tapped together on the canvas undo (review 2.12). */
import { describe, it, expect, vi } from 'vitest';
import { attachTwoFingerTap } from './twoFingerTap';

function setup() {
  const container = document.createElement('div');
  const canvas = document.createElement('div');
  canvas.className = 'tl-canvas';
  container.appendChild(canvas);
  document.body.appendChild(container);
  let t = 0;
  const onTap = vi.fn();
  const detach = attachTwoFingerTap(container, onTap, { now: () => t });
  const fire = (type, id, { x = 10, pointerType = 'touch', at } = {}) => {
    if (at !== undefined) t = at;
    canvas.dispatchEvent(new PointerEvent(type, { pointerType, pointerId: id, clientX: x, clientY: 10, bubbles: true }));
  };
  return { fire, onTap, detach };
}

describe('two-finger tap', () => {
  it('two quick, still touches undo once', () => {
    const { fire, onTap } = setup();
    fire('pointerdown', 1, { at: 0 }); fire('pointerdown', 2, { at: 30 });
    fire('pointerup', 1, { at: 120 }); fire('pointerup', 2, { at: 140 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('a pinch (movement), a slow hold, three fingers or a pen do nothing', () => {
    const { fire, onTap } = setup();
    fire('pointerdown', 1, { at: 0 }); fire('pointerdown', 2, { at: 10 }); fire('pointermove', 2, { x: 60 }); fire('pointerup', 1, { at: 100 }); fire('pointerup', 2, { at: 110 });
    fire('pointerdown', 3, { at: 1000 }); fire('pointerdown', 4, { at: 1010 }); fire('pointerup', 3, { at: 1600 }); fire('pointerup', 4, { at: 1610 });
    fire('pointerdown', 5, { at: 2000 }); fire('pointerdown', 6, { at: 2010 }); fire('pointerdown', 7, { at: 2020 });
    fire('pointerup', 5, { at: 2100 }); fire('pointerup', 6, { at: 2100 }); fire('pointerup', 7, { at: 2100 });
    fire('pointerdown', 8, { pointerType: 'pen', at: 3000 }); fire('pointerdown', 9, { pointerType: 'pen' }); fire('pointerup', 8); fire('pointerup', 9);
    expect(onTap).not.toHaveBeenCalled();
  });
});
