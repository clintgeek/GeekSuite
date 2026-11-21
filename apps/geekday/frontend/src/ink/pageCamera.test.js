import { describe, it, expect, vi } from 'vitest';
import { PAGE_WIDTH, pageZoom, clientToPage, lockPageCamera } from './pageCamera';

describe('the fixed page', () => {
  it('zoom makes 1000 page units span the container', () => {
    expect(PAGE_WIDTH).toBe(1000);
    expect(pageZoom(800)).toBeCloseTo(0.8);
    expect(pageZoom(1200)).toBeCloseTo(1.2);
    expect(pageZoom(0)).toBe(1);
    expect(pageZoom(undefined)).toBe(1);
  });
  it('a client point becomes the same page point at any width', () => {
    expect(clientToPage(100 + 400, 50 + 80, { left: 100, top: 50, width: 800 })).toEqual({ x: 500, y: 100 });
    expect(clientToPage(600, 120, { left: 0, top: 0, width: 1200 })).toEqual({ x: 500, y: 100 });
  });
  it('locks the camera and forces it to the page origin at the page zoom', () => {
    const editor = { setCameraOptions: vi.fn(), setCamera: vi.fn() };
    lockPageCamera(editor, 500);
    expect(editor.setCameraOptions).toHaveBeenCalledWith({ isLocked: true, wheelBehavior: 'none' });
    expect(editor.setCamera).toHaveBeenCalledWith({ x: 0, y: 0, z: 0.5 }, { force: true });
    expect(() => lockPageCamera(null, 500)).not.toThrow();
  });
});
