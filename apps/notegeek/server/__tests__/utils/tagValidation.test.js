import { formatTag, validateTags } from '../../utils/tagValidation.js';

describe('formatTag', () => {
    test('converts spaces to underscores', () => {
        expect(formatTag('hello world')).toBe('hello_world');
        expect(formatTag('multiple   spaces  here')).toBe('multiple_spaces_here');
    });

    test('trims whitespace', () => {
        expect(formatTag('  padded  ')).toBe('padded');
        expect(formatTag('  multiple  words  ')).toBe('multiple_words');
    });

    test('allows valid characters', () => {
        expect(formatTag('hello-world')).toBe('hello-world');
        expect(formatTag('tag/subtag')).toBe('tag/subtag');
        expect(formatTag('hello_world123')).toBe('hello_world123');
    });

    test('throws error for invalid characters', () => {
        expect(() => formatTag('hello!')).toThrow();
        expect(() => formatTag('tag@email.com')).toThrow();
        expect(() => formatTag('special#char')).toThrow();
    });

    test('throws error for empty tags', () => {
        expect(() => formatTag('')).toThrow('Tag cannot be empty');
        expect(() => formatTag('   ')).toThrow('Tag cannot be empty');
    });

    test('throws error for non-string input', () => {
        expect(() => formatTag(123)).toThrow('Tag must be a string');
        expect(() => formatTag(null)).toThrow('Tag must be a string');
        expect(() => formatTag(undefined)).toThrow('Tag must be a string');
    });
});

describe('validateTags', () => {
    test('formats array of tags', () => {
        const input = ['hello world', 'tag two', 'another tag'];
        const expected = ['hello_world', 'tag_two', 'another_tag'];
        expect(validateTags(input)).toEqual(expected);
    });

    test('removes duplicates', () => {
        const input = ['hello', 'hello', 'world', 'world'];
        const expected = ['hello', 'world'];
        expect(validateTags(input)).toEqual(expected);
    });

    test('removes duplicates after formatting', () => {
        const input = ['hello world', 'hello_world', 'hello  world'];
        const expected = ['hello_world'];
        expect(validateTags(input)).toEqual(expected);
    });

    test('throws error for non-array input', () => {
        expect(() => validateTags('not an array')).toThrow('Tags must be an array');
        expect(() => validateTags(123)).toThrow('Tags must be an array');
        expect(() => validateTags(null)).toThrow('Tags must be an array');
    });

    test('handles empty array', () => {
        expect(validateTags([])).toEqual([]);
    });

    test('propagates errors from formatTag', () => {
        expect(() => validateTags(['valid', 'invalid!'])).toThrow();
        expect(() => validateTags(['valid', ''])).toThrow();
    });
});