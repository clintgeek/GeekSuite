/**
 * Dragging a task row onto another day (W4), with pointer events: HTML5
 * drag-and-drop does nothing for a finger or a pen, which is what this page
 * is held with. Rows carry `touch-action: none`, so the browser hands the
 * whole gesture over instead of scrolling with it.
 *
 * A press becomes a drag after DRAG_SLOP_PX of travel. From then the hook
 * reports where the pointer is and which cell is under it (the element with
 * `data-week-cell`), and on release calls `onDrop(task, cellKey)`. Escape, a
 * cancelled pointer or a lost window abort it with nothing changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const DRAG_SLOP_PX = 8;

/** The `data-week-cell` value under a point, or '' when it is over none. */
function cellAt(x, y) {
  const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return under?.closest?.('[data-week-cell]')?.getAttribute('data-week-cell') || '';
}

/**
 * @param {object} opts
 * @param {(task: object, cellKey: string) => void} opts.onDrop  called once, on release over a cell
 * @param {boolean} [opts.enabled]
 * @returns {{ drag: null | { task: object, x: number, y: number, over: string, width: number }, rowProps: (task: object) => object }}
 */
export function useWeekDrag({ onDrop, enabled = true }) {
  const [drag, setDrag] = useState(null);
  const press = useRef(null);
  const stop = useRef(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const end = useCallback(() => {
    stop.current?.();
    stop.current = null;
    press.current = null;
    setDrag(null);
  }, []);

  useEffect(() => end, [end]);
  useEffect(() => {
    if (!enabled) end();
  }, [enabled, end]);

  const onPointerDown = useCallback(
    (task, event) => {
      if (!enabled || press.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // The tick and the menu button are for tapping; a drag starts on the words.
      if (event.target?.closest?.('button, a, [role="checkbox"]')) return;
      const row = event.currentTarget;
      const box = row.getBoundingClientRect();
      press.current = {
        id: event.pointerId,
        task,
        x: event.clientX,
        y: event.clientY,
        // Where in the row it was picked up, so the floating copy stays under the pointer the same way.
        dx: event.clientX - box.left,
        dy: event.clientY - box.top,
        width: box.width,
        dragging: false,
      };

      const move = (e) => {
        const p = press.current;
        if (!p || e.pointerId !== p.id) return;
        if (!p.dragging) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP_PX) return;
          p.dragging = true;
        }
        e.preventDefault?.();
        setDrag({ task: p.task, x: e.clientX - p.dx, y: e.clientY - p.dy, over: cellAt(e.clientX, e.clientY), width: p.width });
      };
      const up = (e) => {
        const p = press.current;
        if (!p || e.pointerId !== p.id) return;
        const over = p.dragging ? cellAt(e.clientX, e.clientY) : '';
        end();
        if (over) dropRef.current?.(p.task, over);
      };
      const cancel = (e) => {
        if (press.current && e.pointerId === press.current.id) end();
      };
      const key = (e) => {
        if (e.key !== 'Escape' || !press.current?.dragging) return;
        // This Escape is the drag's alone: it must not also close something else.
        e.preventDefault();
        e.stopPropagation();
        end();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      window.addEventListener('blur', end);
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('blur', end);
      };
    },
    [enabled, end]
  );

  const rowProps = useCallback(
    (task) => (enabled ? { onPointerDown: (event) => onPointerDown(task, event) } : {}),
    [enabled, onPointerDown]
  );

  return { drag, rowProps };
}
