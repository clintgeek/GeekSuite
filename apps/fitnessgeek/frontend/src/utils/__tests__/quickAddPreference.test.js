/**
 * The opt-in switch for natural-language quick-add, now that R124 moved it
 * onto the settings document.
 *
 * Three things matter and all three are rules in DOCS/AI_IDEAS.md: it is
 * **off** until somebody turns it on, an existing opt-in must survive the move
 * off localStorage, and a browser that will not give us storage must read as
 * "nothing to migrate" rather than throwing on the Food Log page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QUICK_ADD_NL_KEY,
  isNaturalQuickAddEnabled,
  readLegacyOptIn,
  clearLegacyOptIn,
  migrateLegacyQuickAddOptIn,
} from '../quickAddPreference.js';

const on = { ai: { enabled: true, features: { natural_language_food_logging: true } } };
const off = { ai: { enabled: true, features: { natural_language_food_logging: false } } };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('isNaturalQuickAddEnabled', () => {
  it('is off by default — an absent or empty settings document', () => {
    for (const settings of [undefined, null, {}, { ai: null }, { ai: {} }]) {
      expect(isNaturalQuickAddEnabled(settings)).toBe(false);
    }
  });

  it('is on only when the flag is literally true', () => {
    expect(isNaturalQuickAddEnabled(on)).toBe(true);
    expect(isNaturalQuickAddEnabled(off)).toBe(false);
    expect(
      isNaturalQuickAddEnabled({ ai: { features: { natural_language_food_logging: 'true' } } })
    ).toBe(false);
  });

  it('honours ai.enabled as the wholesale kill switch, same as the resolver', () => {
    expect(
      isNaturalQuickAddEnabled({
        ai: { enabled: false, features: { natural_language_food_logging: true } },
      })
    ).toBe(false);
  });

  it('treats a missing ai.enabled as not-disabled', () => {
    expect(
      isNaturalQuickAddEnabled({ ai: { features: { natural_language_food_logging: true } } })
    ).toBe(true);
  });
});

describe('the legacy localStorage flag', () => {
  it('reads null when nothing is stored', () => {
    expect(readLegacyOptIn()).toBeNull();
  });

  it('reads back what was stored, and clears', () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    expect(readLegacyOptIn()).toBe('true');
    clearLegacyOptIn();
    expect(readLegacyOptIn()).toBeNull();
  });

  it('a browser that refuses storage reads as nothing and clears without throwing', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readLegacyOptIn()).toBeNull();
    expect(() => clearLegacyOptIn()).not.toThrow();
  });
});

describe('migrateLegacyQuickAddOptIn', () => {
  it('writes an R115 opt-in to the server once, then drops the local flag', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    const saveAISettings = vi.fn().mockResolvedValue({});

    await expect(migrateLegacyQuickAddOptIn({ settings: off, saveAISettings })).resolves.toBe(true);

    expect(saveAISettings).toHaveBeenCalledTimes(1);
    expect(saveAISettings).toHaveBeenCalledWith({
      features: { natural_language_food_logging: true },
    });
    expect(readLegacyOptIn()).toBeNull();
  });

  it('is a one-shot — a second load has nothing left to migrate', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    const saveAISettings = vi.fn().mockResolvedValue({});
    await migrateLegacyQuickAddOptIn({ settings: off, saveAISettings });

    saveAISettings.mockClear();
    await expect(migrateLegacyQuickAddOptIn({ settings: on, saveAISettings })).resolves.toBe(true);
    expect(saveAISettings).not.toHaveBeenCalled();
  });

  it('keeps the local flag when the write fails, so the next load retries', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    const saveAISettings = vi.fn().mockRejectedValue(new Error('offline'));

    // On for this session — the person opted in; a failed migration should not
    // look to them like the feature was switched off.
    await expect(migrateLegacyQuickAddOptIn({ settings: off, saveAISettings })).resolves.toBe(true);
    expect(readLegacyOptIn()).toBe('true');
  });

  it('discards a legacy flag that was never an opt-in, without writing', async () => {
    const saveAISettings = vi.fn();
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      window.localStorage.setItem(QUICK_ADD_NL_KEY, value);
      await expect(
        migrateLegacyQuickAddOptIn({ settings: off, saveAISettings })
      ).resolves.toBe(false);
      expect(readLegacyOptIn()).toBeNull();
    }
    expect(saveAISettings).not.toHaveBeenCalled();
  });

  it('drops the flag rather than honouring it when AI is switched off wholesale', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    const saveAISettings = vi.fn();
    const settings = { ai: { enabled: false, features: { natural_language_food_logging: false } } };

    await expect(migrateLegacyQuickAddOptIn({ settings, saveAISettings })).resolves.toBe(false);
    expect(saveAISettings).not.toHaveBeenCalled();
    expect(readLegacyOptIn()).toBeNull();
  });

  it('with no local flag it is just "read the server setting"', async () => {
    const saveAISettings = vi.fn();
    await expect(migrateLegacyQuickAddOptIn({ settings: on, saveAISettings })).resolves.toBe(true);
    await expect(migrateLegacyQuickAddOptIn({ settings: off, saveAISettings })).resolves.toBe(false);
    await expect(migrateLegacyQuickAddOptIn({ settings: null, saveAISettings })).resolves.toBe(false);
    expect(saveAISettings).not.toHaveBeenCalled();
  });

  it('a storage-less browser migrates nothing and still answers from the server', async () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const saveAISettings = vi.fn();
    await expect(migrateLegacyQuickAddOptIn({ settings: on, saveAISettings })).resolves.toBe(true);
    expect(saveAISettings).not.toHaveBeenCalled();
  });
});
