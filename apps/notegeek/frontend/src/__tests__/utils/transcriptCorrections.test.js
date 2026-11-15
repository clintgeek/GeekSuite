/** Corrections carried into the next reading by line diff (review 2.11). */
import { describe, it, expect, beforeEach } from 'vitest';
import { correctionPairs, applyCorrectionPairs, rememberCorrections, carryCorrections } from '../../utils/transcriptCorrections';

beforeEach(() => localStorage.clear());

describe('transcript corrections', () => {
  it('pairs the lines the writer changed, ignoring added or removed ones', () => {
    const read = '# Standup\n* call Bbo\n- teh roof\nmisc';
    const fixed = '# Standup\n* call Bob\n- the roof\nmisc\nan added line';
    expect(correctionPairs(read, fixed)).toEqual([['* call Bbo', '* call Bob'], ['- teh roof', '- the roof']]);
  });

  it('a new reading gets the fixes back on lines read the same way; changed lines stay as read', () => {
    rememberCorrections('n1', 'Standup\n* call Bbo\n- teh roof', 'Standup\n* call Bob\n- the roof');
    const next = 'Standup\n* call Bbo\n- teh roofer\n* a new line';
    expect(carryCorrections('n1', next)).toBe('Standup\n* call Bob\n- teh roofer\n* a new line');
    expect(carryCorrections('other', next)).toBe(next);
  });

  it('nothing remembered: the reading is untouched', () => {
    expect(applyCorrectionPairs('a\nb', [])).toBe('a\nb');
    expect(carryCorrections('n1', 'a\nb')).toBe('a\nb');
  });
});
