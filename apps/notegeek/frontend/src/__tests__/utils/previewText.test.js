import { describe, it, expect } from 'vitest';
import { previewText } from '../../utils/previewText';

describe('previewText — prose keeps a little shape', () => {
  it('runs a heading into its paragraph with a dash, and separates list items', () => {
    const html = '<h2>Roadmap</h2><p>Draft agenda.</p><ul><li>Ship it</li><li>Close CSRF</li></ul>';
    expect(previewText(html, 'markdown', 180, { shape: true })).toBe('Roadmap — Draft agenda. Ship it · Close CSRF');
    // Off by default.
    expect(previewText(html, 'markdown')).toBe('Roadmap Draft agenda. Ship it Close CSRF');
  });

  it('does the same for a markdown heading', () => {
    expect(previewText('# Cookies\n\nBrown the butter first.', 'markdown', 180, { shape: true })).toBe('Cookies — Brown the butter first.');
  });

  it('leaves no dangling separator', () => {
    expect(previewText('<h1>Only a title</h1>', 'markdown', 180, { shape: true })).toBe('Only a title');
    expect(previewText('## Heading only', 'markdown', 180, { shape: true })).toBe('Heading only');
  });
});
