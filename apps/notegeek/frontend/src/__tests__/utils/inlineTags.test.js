import { describe, it, expect } from 'vitest';
import {
  findTagTokens,
  extractInlineTags,
  applyInlineTags,
  supportsInlineTags,
} from '../../utils/inlineTags';

const md = (s) => extractInlineTags(s, 'markdown');
const html = (s) => extractInlineTags(s, 'text');

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
    ['#GeekSuite and #work/RoadMap', ['geek-suite', 'work/road-map']],
    ['#v2 #2024plan', ['v2']],
    ['#café #日記 #naïve', ['café', '日記', 'naïve']],
    ['tab\t#tabbed', ['tabbed']],
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
    // A "(" inside a URL is still the URL, not a boundary.
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

  it('dedupes in the suite standard, in order', () => {
    expect(md('#Work then #work then #home #Work')).toEqual(['work', 'home']);
  });

  it('drops a tag longer than the gateway allows', () => {
    expect(md(`#${'a'.repeat(101)} #ok`)).toEqual(['ok']);
  });
});

describe('rich text (TipTap HTML)', () => {
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

describe('which notes are read', () => {
  it('markdown and text only', () => {
    expect(supportsInlineTags('markdown')).toBe(true);
    expect(supportsInlineTags('text')).toBe(true);
    for (const type of ['code', 'mindmap', 'handwritten']) {
      expect(supportsInlineTags(type)).toBe(false);
      expect(extractInlineTags('#house', type)).toEqual([]);
    }
  });
});

describe('findTagTokens', () => {
  it('reports where each token sits, excluding a trailing slash', () => {
    expect(findTagTokens('go #house/ now')).toEqual([{ tag: 'house', raw: 'house', start: 3, end: 9 }]);
  });
  it('atStart: false refuses a hash at index 0 (it continues an earlier word)', () => {
    expect(findTagTokens('#glued', { atStart: false })).toEqual([]);
    expect(findTagTokens('#glued')).toHaveLength(1);
  });
});

describe('applyInlineTags — merging on save', () => {
  it('appends new inline tags after the chips and never removes a chip', () => {
    const r = applyInlineTags({ tags: ['keep', 'house'], content: 'about #garden', type: 'markdown' });
    expect(r.tags).toEqual(['keep', 'house', 'garden']);
    expect(r.changed).toBe(true);
    expect([...r.provisional]).toEqual(['garden']);
  });

  it('does not add a case variant of a chip already there', () => {
    const r = applyInlineTags({ tags: ['Work'], content: '#work', type: 'markdown' });
    expect(r.tags).toEqual(['Work']);
    expect(r.changed).toBe(false);
  });

  it('removing the text does not remove the tag', () => {
    const r = applyInlineTags({ tags: ['garden'], content: 'nothing here', type: 'markdown', provisional: new Set(['garden']) });
    expect(r.tags).toEqual(['garden']);
  });

  it('a provisional tag that was a word still being typed is taken back', () => {
    const first = applyInlineTags({ tags: [], content: 'fix #hou', type: 'markdown' });
    expect(first.tags).toEqual(['hou']);
    const second = applyInlineTags({ tags: first.tags, content: 'fix #house/gar', type: 'markdown', provisional: first.provisional });
    expect(second.tags).toEqual(['house/gar']);
    const third = applyInlineTags({ tags: second.tags, content: 'fix #house/garage', type: 'markdown', provisional: second.provisional });
    expect(third.tags).toEqual(['house/garage']);
  });

  it('a chip the user added is never taken back, even when it prefixes an inline tag', () => {
    const r = applyInlineTags({ tags: ['hou'], content: '#house', type: 'markdown' });
    expect(r.tags).toEqual(['hou', 'house']);
  });

  it('a tag removed by chip this session is not put straight back', () => {
    const r = applyInlineTags({ tags: [], content: '#house', type: 'markdown', suppressed: new Set(['house']) });
    expect(r.tags).toEqual([]);
  });

  it('stops at the gateway’s 50 tags', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const r = applyInlineTags({ tags: fifty, content: '#extra', type: 'markdown' });
    expect(r.tags).toHaveLength(50);
    expect(r.changed).toBe(false);
  });

  it('leaves code notes alone', () => {
    const r = applyInlineTags({ tags: ['a'], content: '#house', type: 'code' });
    expect(r.tags).toEqual(['a']);
    expect(r.changed).toBe(false);
  });
});

describe('applyInlineTags — the kebab-case standard (2026-10-01)', () => {
  it('#GeekSuite tags the note geek-suite', () => {
    const r = applyInlineTags({ tags: [], content: 'ship #GeekSuite', type: 'markdown' });
    expect(r.tags).toEqual(['geek-suite']);
  });

  it('a camelCase word still being typed is taken back when it grows', () => {
    const first = applyInlineTags({ tags: [], content: '#Geek', type: 'markdown' });
    expect(first.tags).toEqual(['geek']);
    const second = applyInlineTags({ tags: first.tags, content: '#GeekS', type: 'markdown', provisional: first.provisional });
    expect(second.tags).toEqual(['geek-s']);
    const third = applyInlineTags({ tags: second.tags, content: '#GeekSuite', type: 'markdown', provisional: second.provisional });
    expect(third.tags).toEqual(['geek-suite']);
  });

  it('an acronym that splits as it grows is still a word being typed (https → http-server)', () => {
    const first = applyInlineTags({ tags: [], content: '#HTTPS', type: 'markdown' });
    expect(first.tags).toEqual(['https']);
    const second = applyInlineTags({ tags: first.tags, content: '#HTTPServer', type: 'markdown', provisional: first.provisional });
    expect(second.tags).toEqual(['http-server']);
  });

  it('a legacy chip is not duplicated by its standard spelling', () => {
    const r = applyInlineTags({ tags: ['GeekSuite'], content: '#geek-suite', type: 'markdown' });
    expect(r.tags).toEqual(['GeekSuite']);
    expect(r.changed).toBe(false);
  });
});
