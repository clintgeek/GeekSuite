import { describe, it, expect } from 'vitest';
import { decodeCodeNote, previewText } from '../../utils/previewText';

/**
 * `CodeEditor` stores a code note as `JSON.stringify({ language, code })`.
 * Everything that displayed one OUTSIDE that editor rendered the envelope
 * verbatim before the 2026-09-05 going-over — `NoteViewer` printed
 * `{"language":"javascript","code":"..."}` inside a `<pre>`, and the list
 * preview showed that same string's first line.
 */
describe('decodeCodeNote', () => {
  it('unwraps the envelope CodeEditor writes', () => {
    const stored = JSON.stringify({ language: 'javascript', code: 'const a = 1;\nconst b = 2;' });
    expect(decodeCodeNote(stored)).toEqual({
      language: 'javascript',
      code: 'const a = 1;\nconst b = 2;',
    });
  });

  it('passes a legacy bare code string straight through', () => {
    expect(decodeCodeNote('SELECT 1;')).toEqual({ language: null, code: 'SELECT 1;' });
  });

  it('does not mangle a body that merely starts with a brace', () => {
    // A JSON snippet someone pasted as their code, or a C block.
    const body = '{ "not": "the envelope" }';
    expect(decodeCodeNote(body).code).toBe(body);
    expect(decodeCodeNote('{\n  int x = 1;\n}').code).toBe('{\n  int x = 1;\n}');
  });

  it('survives malformed input', () => {
    expect(decodeCodeNote('{broken').code).toBe('{broken');
    expect(decodeCodeNote('').code).toBe('');
    expect(decodeCodeNote(undefined).code).toBe('');
  });
});

describe('previewText — code notes', () => {
  it('previews the first line of the CODE, not of the JSON envelope', () => {
    const stored = JSON.stringify({ language: 'python', code: 'def main():\n    pass' });
    expect(previewText(stored, 'code')).toBe('def main():');
    expect(previewText(stored, 'code')).not.toContain('language');
  });

  it('skips leading blank lines, as it always did', () => {
    const stored = JSON.stringify({ language: 'go', code: '\n\nfunc main() {}' });
    expect(previewText(stored, 'code')).toBe('func main() {}');
  });
});
