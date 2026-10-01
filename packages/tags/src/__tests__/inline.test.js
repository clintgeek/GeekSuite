import { describe, it, expect } from 'vitest';
import { findTagTokens, parseInlineTags } from '../index.js';

// Ported from NoteGeek's __tests__/utils/inlineTags.test.js (2026-09-30), with
// the outputs moved to the kebab-case standard.
const md = (s) => parseInlineTags(s, { format: 'markdown' });
const html = (s) => parseInlineTags(s, { format: 'html' });

describe('what counts as an inline tag', () => {
  it.each([
    ['#house', ['house']],
    ['buy nails #house/garage today', ['house/garage']],
    ['start\n#first line', ['first']],
    ['(see #house)', ['house']],
    ['#house.', ['house']],
    ['#house, #garden; #shed!', ['house', 'garden', 'shed']],
    ["#house's roof", ['house']],
    ['#house/', ['house']],
    ['#house//garage/', ['house/garage']],
    ['#to-do and #snake_case', ['to-do', 'snake-case']],
    ['#v2 #2024plan', ['v2']],
    ['#café #日記 #naïve', ['café', '日記', 'naïve']],
    ['tab\t#tabbed', ['tabbed']],
    // the standard applies to what is read
    ['#GeekSuite', ['geek-suite']],
    ['#work/GeekSuite roadmap', ['work/geek-suite']],
    ['#Road_Map', ['road-map']],
    ['#HTTPServer', ['http-server']],
  ])('%j → %j', (text, expected) => {
    expect(md(text)).toEqual(expected);
  });

  it.each([
    ['# Heading'],
    ['## Two #\n### Three'],
    ['#1 and #42'],
    ['#fff #FFF #a1b2c3 #ffffffff #abcd'],
    ['C# and a#b and x#y'],
    ['\\#escaped'],
    ['&#35;entity'],
    ['`#inline code`'],
    ['``code with ` and #tag``'],
    ['```\n#fenced\n```'],
    ['~~~js\nconst x = "#nope";\n~~~'],
    ['https://x.com/#section'],
    ['www.example.com/#frag'],
    ['see https://en.wikipedia.org/wiki/Set_(#math) there'],
    ['[a link](#anchor)'],
    ['[a link](https://x.com/#section "t")'],
    ['<https://x.com/#auto>'],
    ['<a href="#x">plain</a>'],
    ['[ref]: https://x.com/#def'],
    ['#'],
    ['# '],
  ])('%j → nothing', (text) => {
    expect(md(text)).toEqual([]);
  });

  it('is not fooled by a hex-looking word that is not 3/4/6/8 long', () => {
    expect(md('#abcde #facade1')).toEqual(['abcde', 'facade1']);
  });

  it('hexColours: false reads an all-hex word as a tag (BuJoGeek one-liners)', () => {
    expect(parseInlineTags('#cafe #add', { format: 'plain', hexColours: false })).toEqual(['cafe', 'add']);
    expect(parseInlineTags('#cafe #add', { format: 'plain' })).toEqual([]);
  });

  it('an unclosed fence swallows the rest, as CommonMark renders it', () => {
    expect(md('#before\n```\n#inside')).toEqual(['before']);
  });

  it('text after a fence closes is read again', () => {
    expect(md('```\n#in\n```\n#after')).toEqual(['after']);
  });

  it('link TEXT still counts; its target does not', () => {
    expect(md('[#house notes](#anchor)')).toEqual([]); // `[` precedes the hash
    expect(md('see ( #house ) [x](#anchor)')).toEqual(['house']);
  });

  it('dedupes after normalization, in order', () => {
    expect(md('#Work then #work then #home #WORK #geekSuite #geek-suite')).toEqual(['work', 'home', 'geek-suite']);
  });

  it('drops a tag longer than 100 once normalized', () => {
    expect(md(`#${'a'.repeat(101)} #ok`)).toEqual(['ok']);
    // 51 raw characters that grow past 100 when camelCase splits
    expect(md(`#${'aB'.repeat(51)} #ok`)).toEqual(['ok']);
  });

  it('stops at 50 tags', () => {
    const text = Array.from({ length: 60 }, (_, i) => `#t${String.fromCharCode(97 + (i % 26))}${i}`).join(' ');
    expect(md(text)).toHaveLength(50);
  });

  it('plain format reads code-looking text as plain', () => {
    expect(parseInlineTags('`#x`', { format: 'plain' })).toEqual([]); // backtick is not a boundary
    expect(parseInlineTags('see https://x.com/ #y', { format: 'plain' })).toEqual(['y']);
  });

  it('non-strings are []', () => {
    expect(parseInlineTags(null)).toEqual([]);
    expect(parseInlineTags('')).toEqual([]);
  });
});

describe('rich text (HTML)', () => {
  it('reads tags from paragraphs, list items and after line breaks', () => {
    expect(html('<p>one #house</p><p>#garden</p><ul><li><p>#shed</p></li></ul><p>a<br>#after</p>'))
      .toEqual(['house', 'garden', 'shed', 'after']);
  });

  it('ignores code, pre, link targets and URLs', () => {
    expect(html('<p><code>#code</code></p><pre><code>#block</code></pre>'
      + '<p><a href="https://x.com/#section">https://x.com/#section</a></p>')).toEqual([]);
  });

  it('decodes entities and treats &nbsp; as a space', () => {
    expect(html('<p>a&nbsp;#house &amp; #garden</p>')).toEqual(['house', 'garden']);
  });

  it('an inline mark between text and hash does not create a boundary', () => {
    expect(html('<p><strong>bold</strong>#glued</p>')).toEqual([]);
  });

  it('an ATX-looking line in rich text is still not a tag', () => {
    expect(html('<p># Heading</p>')).toEqual([]);
  });
});

describe('findTagTokens', () => {
  it('reports where each token sits, excluding a trailing slash', () => {
    expect(findTagTokens('go #house/ now')).toEqual([{ tag: 'house', raw: 'house', start: 3, end: 9 }]);
  });
  it('the span covers the token as WRITTEN while the tag is normalized', () => {
    const [t] = findTagTokens('ship #GeekSuite today');
    expect(t).toEqual({ tag: 'geek-suite', raw: 'GeekSuite', start: 5, end: 15 });
    expect('ship #GeekSuite today'.slice(t.start, t.end)).toBe('#GeekSuite');
  });
  it('atStart: false refuses a hash at index 0 (it continues an earlier word)', () => {
    expect(findTagTokens('#glued', { atStart: false })).toEqual([]);
    expect(findTagTokens('#glued')).toHaveLength(1);
  });
  it('is safe to call repeatedly (no shared lastIndex)', () => {
    expect(findTagTokens('#a1 #b2')).toHaveLength(2);
    expect(findTagTokens('#a1 #b2')).toHaveLength(2);
  });
});
