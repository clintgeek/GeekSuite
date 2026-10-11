/**
 * The client mirror of the gateway's pathExclude rules: trim, drop empties,
 * drop duplicates keeping the first, ≤ 20 entries, ≤ 200 characters each,
 * each compiles as `new RegExp(entry)`.
 */
import { PATH_RULES_MAX, PATH_RULE_MAX_LENGTH, normalizePathRules, pathRuleError, pathRulesChange, pathRulesErrors } from '../../utils/pathRules';

describe('normalizePathRules', () => {
  it('trims, drops empties and keeps the first of each duplicate (after the trim)', () => {
    expect(normalizePathRules(['  ^/a/ ', '', '   ', '^/b/', '^/a/', ' ^/b/', '^/c/'])).toEqual(['^/a/', '^/b/', '^/c/']);
    expect(normalizePathRules([])).toEqual([]);
    expect(normalizePathRules()).toEqual([]);
  });
});

describe('pathRuleError', () => {
  it('accepts a pattern that compiles, and an empty row (it is dropped)', () => {
    expect(pathRuleError('^/online_features/')).toBeNull();
    expect(pathRuleError('/obituaries/\\d+')).toBeNull();
    expect(pathRuleError('   ')).toBeNull();
  });

  it('refuses a pattern that does not compile', () => {
    expect(pathRuleError('^/(press')).toMatch(/not a valid pattern/i);
    expect(pathRuleError('[a-')).toMatch(/not a valid pattern/i);
    expect(pathRuleError('*foo')).toMatch(/not a valid pattern/i);
  });

  it('refuses more than 200 characters (counted after the trim)', () => {
    const at = `^/${'a'.repeat(PATH_RULE_MAX_LENGTH - 2)}`;
    expect(at).toHaveLength(200);
    expect(pathRuleError(`  ${at}  `)).toBeNull();
    expect(pathRuleError(`${at}b`)).toMatch(/200 characters/);
  });
});

describe('pathRulesErrors', () => {
  it('marks each bad row by its index', () => {
    const e = pathRulesErrors(['^/ok/', '(', '']);
    expect(e.rows[0]).toBeNull();
    expect(e.rows[1]).toMatch(/not a valid pattern/i);
    expect(e.rows[2]).toBeNull();
    expect(e.list).toBeNull();
    expect(e.any).toBe(true);
    expect(pathRulesErrors(['^/ok/', '']).any).toBe(false);
  });

  it('allows 20 distinct patterns and refuses 21; duplicates and blanks do not count', () => {
    const twenty = Array.from({ length: PATH_RULES_MAX }, (_, i) => `^/p${i}/`);
    expect(pathRulesErrors([...twenty, '^/p0/', ' ', '']).any).toBe(false);
    const e = pathRulesErrors([...twenty, '^/p20/']);
    expect(e.list).toMatch(/at most 20/i);
    expect(e.any).toBe(true);
  });
});

describe('pathRulesChange', () => {
  it('is undefined when the normalized list equals the saved one', () => {
    expect(pathRulesChange(['^/a/'], [' ^/a/ ', ''])).toBeUndefined();
    expect(pathRulesChange([], [''])).toBeUndefined();
    expect(pathRulesChange(undefined, [])).toBeUndefined();
  });

  it('is the normalized list when it changed (including emptied)', () => {
    expect(pathRulesChange(['^/a/'], ['^/a/', ' ^/b/'])).toEqual(['^/a/', '^/b/']);
    expect(pathRulesChange(['^/a/'], [])).toEqual([]);
    expect(pathRulesChange(['^/a/', '^/b/'], ['^/b/', '^/a/'])).toEqual(['^/b/', '^/a/']);
  });
});
