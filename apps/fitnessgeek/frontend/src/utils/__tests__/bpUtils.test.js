/**
 * Tests for the one canonical BP categoriser, `categorizeBP`.
 *
 * Coverage is anchored on the four bugs found in review on 2026-09-19:
 *   - BPLogList's `systolic < 140 || diastolic < 90` for Stage 1 labelled
 *     190/70 (a Crisis-range systolic) as Stage 1 — the mildest non-normal
 *     tier. 190/70 -> Crisis is therefore the headline case below.
 *   - BPInsights/BPCategoryDistribution tested Stage 2 before Crisis, making
 *     Crisis unreachable — 185/75 and 181/121 catch that class directly.
 *   - bpUtils itself had no Crisis tier at all.
 *   - AddBPDialog/QuickAddBP invented a "High Normal" band not covered here
 *     (that's their own migration, not this categoriser's contract).
 */
import { describe, it, expect } from 'vitest';
import { categorizeBP, BP_STAGES } from '../bpUtils.js';

describe('categorizeBP', () => {
  it('190/70 is Crisis — the headline bug (was mislabelled Stage 1)', () => {
    expect(categorizeBP(190, 70).stage).toBe(BP_STAGES.CRISIS);
  });

  it('185/75 is Crisis', () => {
    expect(categorizeBP(185, 75).stage).toBe(BP_STAGES.CRISIS);
  });

  it('160/85 is Stage 2', () => {
    expect(categorizeBP(160, 85).stage).toBe(BP_STAGES.STAGE_2);
  });

  it('135/75 is Stage 1', () => {
    expect(categorizeBP(135, 75).stage).toBe(BP_STAGES.STAGE_1);
  });

  it('120/80 is Stage 1 (not Elevated, not Normal)', () => {
    expect(categorizeBP(120, 80).stage).toBe(BP_STAGES.STAGE_1);
  });

  it('125/75 is Elevated', () => {
    expect(categorizeBP(125, 75).stage).toBe(BP_STAGES.ELEVATED);
  });

  it('118/76 is Normal', () => {
    expect(categorizeBP(118, 76).stage).toBe(BP_STAGES.NORMAL);
  });

  it('the 180/120 vs 181/121 boundary: 180/120 is Stage 2, not Crisis', () => {
    expect(categorizeBP(180, 120).stage).toBe(BP_STAGES.STAGE_2);
  });

  it('the 180/120 vs 181/121 boundary: 181/121 is Crisis', () => {
    expect(categorizeBP(181, 121).stage).toBe(BP_STAGES.CRISIS);
  });

  it('a non-numeric input returns Unknown, not Normal', () => {
    expect(categorizeBP(undefined, undefined).stage).toBe('Unknown');
    expect(categorizeBP('abc', 80).stage).toBe('Unknown');
    expect(categorizeBP(120, 'xyz').stage).toBe('Unknown');
    expect(categorizeBP(NaN, 80).stage).toBe('Unknown');
  });

  // NOTE for the reviewer: `categorizeBP('', '')` and `categorizeBP(120, null)`
  // do NOT return Unknown — `Number('')` and `Number(null)` both coerce to 0,
  // which is finite, so an empty/null field reads as a real 0/0 reading and
  // categorizes as Normal. That's a real edge case (a blank form field is not
  // a 0 mmHg reading) but it lives inside `categorizeBP` itself, which this
  // task treats as a fixed contract not to be altered — flagging it here
  // rather than asserting behavior the function doesn't have.
});

/*
 * Visual review B3: the stage colours were Tailwind (emerald, amber, orange,
 * red), off the Market Morning palette, and the same in both modes. They are
 * now the theme's semantic tones, mode-aware.
 */
import { createFitnessTheme } from '../../theme/theme.jsx';

describe('categorizeBP colours come from the theme', () => {
  const light = createFitnessTheme('light').palette;
  const dark = createFitnessTheme('dark').palette;

  it('Normal = success, Elevated = warning, Stage 2 and Crisis = error (light)', () => {
    expect(categorizeBP(118, 76).color).toBe(light.success.main);
    expect(categorizeBP(125, 75).color).toBe(light.warning.main);
    expect(categorizeBP(160, 85).color).toBe(light.error.main);
    expect(categorizeBP(190, 70).color).toBe(light.error.main);
  });

  it('Stage 1 is the tomato text tone, not an orange', () => {
    expect(categorizeBP(135, 75).color).toBe(light.produce.breakfast.text);
    expect(categorizeBP(135, 75, 'dark').color).toBe(dark.produce.breakfast.text);
  });

  it('takes the night tones in dark mode', () => {
    expect(categorizeBP(118, 76, 'dark').color).toBe(dark.success.main);
    expect(categorizeBP(125, 75, 'dark').color).toBe(dark.warning.main);
    expect(categorizeBP(190, 70, 'dark').color).toBe(dark.error.main);
  });

  it('names the job in `tone`, and Unknown is muted ink', () => {
    expect(categorizeBP(118, 76).tone).toBe('success');
    expect(categorizeBP(undefined, 80).tone).toBe('muted');
    expect(categorizeBP(undefined, 80).color).toBe(light.text.muted);
  });
});
