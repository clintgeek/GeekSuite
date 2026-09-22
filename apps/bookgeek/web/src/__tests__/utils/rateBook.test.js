/**
 * The rating save: optimistic, rolled back on failure, and — the part worth a
 * test of its own — never overwritten by a response that arrives late.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRateBook } from '../../utils/rateBook';

/** A save whose responses are released by hand, in any order. */
function controllableSave() {
  const pending = [];
  const save = vi.fn((id, rating) => new Promise((resolve, reject) => pending.push({ rating, resolve, reject })));
  return { save, pending };
}

/** Track what the screen would show for one book. */
function screen(initial) {
  let shown = { ...initial };
  const apply = vi.fn((id, patch) => { shown = { ...shown, ...patch }; });
  return { apply, get: () => shown };
}

const DUNE = { id: 'b1', title: 'Dune', rating: 3 };

describe('rateBook', () => {
  it('shows the new rating before the save returns', async () => {
    const { save, pending } = controllableSave();
    const view = screen(DUNE);
    const rate = createRateBook({ save, apply: view.apply });
    const done = rate(DUNE, 5);
    expect(view.get().rating).toBe(5);
    pending[0].resolve({ ...DUNE, rating: 5 });
    await expect(done).resolves.toBe(true);
  });

  it('puts the old rating back when the save fails', async () => {
    const { save, pending } = controllableSave();
    const view = screen(DUNE);
    const rate = createRateBook({ save, apply: view.apply });
    const done = rate(DUNE, 5);
    pending[0].reject(new Error('network'));
    await expect(done).resolves.toBe(false);
    expect(view.get().rating).toBe(3);
  });

  it('a late reply for an earlier tap does not overwrite a later one', async () => {
    // Tap 4 then 5; the reply for 4 arrives LAST.
    const { save, pending } = controllableSave();
    const view = screen(DUNE);
    const rate = createRateBook({ save, apply: view.apply });
    const four = rate(DUNE, 4);
    const five = rate({ ...DUNE, rating: 4 }, 5);
    pending[1].resolve({ ...DUNE, rating: 5 });
    await five;
    pending[0].resolve({ ...DUNE, rating: 4 });
    await four;
    expect(view.get().rating).toBe(5);
  });

  it('a late failure does not roll back past a later tap', async () => {
    const { save, pending } = controllableSave();
    const view = screen(DUNE);
    const rate = createRateBook({ save, apply: view.apply });
    const four = rate(DUNE, 4);
    const five = rate({ ...DUNE, rating: 4 }, 5);
    pending[1].resolve({ ...DUNE, rating: 5 });
    await five;
    pending[0].reject(new Error('timeout'));
    await four;
    // The failed save wanted to restore 3. It must not: 5 is current.
    expect(view.get().rating).toBe(5);
  });

  it('can clear a rating, which is how Undo restores "not rated"', async () => {
    const save = vi.fn(async (id, rating) => ({ id, rating }));
    const view = screen({ id: 'b2', rating: 4 });
    const rate = createRateBook({ save, apply: view.apply });
    await rate({ id: 'b2', rating: 4 }, null);
    expect(save).toHaveBeenCalledWith('b2', null);
    expect(view.get().rating).toBeNull();
  });

  it('sequences each book independently', async () => {
    const { save, pending } = controllableSave();
    const a = screen({ id: 'a', rating: 1 });
    const apply = vi.fn((id, patch) => (id === 'a' ? a.apply(id, patch) : null));
    const rate = createRateBook({ save, apply });
    const first = rate({ id: 'a', rating: 1 }, 2);
    rate({ id: 'b', rating: 1 }, 4);   // another book's tap
    pending[0].resolve({ id: 'a', rating: 2 });
    await first;
    expect(a.get().rating).toBe(2);
  });
});
