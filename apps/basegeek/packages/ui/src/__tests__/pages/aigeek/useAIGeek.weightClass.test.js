/**
 * useAIGeek.weightClass.test.js — `weightClassOf`, the frontend mirror of
 * `AIFreeTier.js`'s backend function of the same name (review §3.4).
 *
 * The UI package cannot import backend model code, so `useAIGeek.js`
 * restates the two thresholds rather than sharing them. That duplication is
 * exactly the kind of thing that drifts silently — a backend threshold
 * change with nothing here to fail — so the boundaries are pinned directly,
 * not just exercised incidentally through `CatalogPanel.test.jsx`.
 */
import { describe, it, expect } from 'vitest';
import { weightClassOf, CATALOG_WEIGHT_FAST_MS, CATALOG_WEIGHT_BALANCED_MS } from '../../../pages/aigeek/useAIGeek';

describe('weightClassOf', () => {
  it('is null for a row that has never been timed', () => {
    expect(weightClassOf(null)).toBeNull();
    expect(weightClassOf(undefined)).toBeNull();
  });

  it('is null rather than a false "fast" for a non-finite value', () => {
    expect(weightClassOf(NaN)).toBeNull();
    expect(weightClassOf(Infinity)).toBeNull();
  });

  it('is "fast" at and under the fast threshold', () => {
    expect(weightClassOf(1)).toBe('fast');
    expect(weightClassOf(CATALOG_WEIGHT_FAST_MS)).toBe('fast');
  });

  it('is "balanced" just past the fast threshold, and at the balanced one', () => {
    expect(weightClassOf(CATALOG_WEIGHT_FAST_MS + 1)).toBe('balanced');
    expect(weightClassOf(CATALOG_WEIGHT_BALANCED_MS)).toBe('balanced');
  });

  it('is "deep" past the balanced threshold', () => {
    expect(weightClassOf(CATALOG_WEIGHT_BALANCED_MS + 1)).toBe('deep');
    expect(weightClassOf(60_000)).toBe('deep');
  });
});
