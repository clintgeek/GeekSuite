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

describe('previewText — prose keeps a little shape', () => {
  it('runs a heading into its paragraph with a dash, and separates list items', () => {
    const html = '<h2>Roadmap</h2><p>Draft agenda.</p><ul><li>Ship it</li><li>Close CSRF</li></ul>';
    expect(previewText(html, 'text', 180, { shape: true })).toBe('Roadmap — Draft agenda. Ship it · Close CSRF');
    // Off by default: the AI excerpt is built from the same function.
    expect(previewText(html, 'text')).toBe('Roadmap Draft agenda. Ship it Close CSRF');
  });

  it('does the same for a markdown heading', () => {
    expect(previewText('# Cookies\n\nBrown the butter first.', 'markdown', 180, { shape: true })).toBe('Cookies — Brown the butter first.');
  });

  it('leaves no dangling separator', () => {
    expect(previewText('<h1>Only a title</h1>', 'text', 180, { shape: true })).toBe('Only a title');
    expect(previewText('## Heading only', 'markdown', 180, { shape: true })).toBe('Heading only');
  });
});
