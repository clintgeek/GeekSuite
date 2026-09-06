/**
 * notegeekSanitize.test.js
 *
 * The save-side half of notegeek's stored-XSS fix (BURN_QUEUE Q63).
 *
 * `NoteViewer` renders a `type: 'text'` note's stored body through
 * `dangerouslySetInnerHTML`, and until now the gateway stored whatever
 * arrived. The client sanitizes on render — that is the control that stops
 * script executing — and this layer keeps the markup out of the database in
 * the first place, so an export, an import, or a future share feature cannot
 * hand it to a reader that forgot.
 *
 * Three things have to hold, and they are what this file asserts:
 *
 *   1. **Only `text` is touched.** `markdown` is markdown source, `code` is a
 *      `{language, code}` envelope, `mindmap`/`handwritten` are JSON
 *      snapshots. Running an HTML sanitizer over any of those would
 *      entity-escape their quotes and angle brackets and corrupt the
 *      document, so they pass through byte-for-byte.
 *   2. **The profile matches the client's**, so a note is stable across a
 *      round trip: `sanitize(sanitize(x)) === sanitize(x)`, and a real TipTap
 *      document is not modified at all.
 *   3. **The resolvers actually call it** — on `createNote`, on `updateNote`,
 *      and on an `updateNote` that omits `type` (which every notegeek client
 *      sends, but a hand-rolled request need not).
 */

import mongoose from 'mongoose';

const { sanitizeNoteContent, sanitizeNoteArgs, HTML_NOTE_TYPES } = await import(
  '../graphql/notegeek/sanitize.js'
);
const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const { Mutation } = resolvers;
const USER = new mongoose.Types.ObjectId();
const ctx = { user: { id: String(USER) } };

/** Sanitize as a `text` note — the only type that carries HTML. */
const clean = (html) => sanitizeNoteContent(html, 'text');

beforeAll(async () => {
  await Note.db.asPromise();
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
});

describe('only the HTML-bearing note type is sanitized', () => {
  test('the set is exactly {text}', () => {
    expect([...HTML_NOTE_TYPES]).toEqual(['text']);
  });

  test('markdown source is stored verbatim, angle brackets and all', () => {
    const md = '# Title\n\nA `<script>` fence and a <b>literal</b> tag & an ampersand.';
    expect(sanitizeNoteContent(md, 'markdown')).toBe(md);
  });

  test('a code note keeps its JSON envelope intact', () => {
    const envelope = JSON.stringify({ language: 'html', code: '<div class="x">&amp;</div>' });
    expect(sanitizeNoteContent(envelope, 'code')).toBe(envelope);
    expect(JSON.parse(sanitizeNoteContent(envelope, 'code')).code).toBe('<div class="x">&amp;</div>');
  });

  test('mindmap and handwritten snapshots survive JSON.parse afterwards', () => {
    const snapshot = JSON.stringify({
      nodes: [{ id: '1', data: { label: 'a < b && c > d' } }],
      edges: [{ id: 'e', source: '1', target: '1', style: { stroke: '#2196f3' } }],
    });
    for (const type of ['mindmap', 'handwritten']) {
      const out = sanitizeNoteContent(snapshot, type);
      expect(out).toBe(snapshot);
      expect(JSON.parse(out).nodes[0].data.label).toBe('a < b && c > d');
    }
  });

  test('an unknown or missing type is left alone rather than guessed at', () => {
    const body = '<p>x</p><script>alert(1)</script>';
    expect(sanitizeNoteContent(body, undefined)).toBe(body);
    expect(sanitizeNoteContent(body, 'something-new')).toBe(body);
  });

  test('a non-string body is returned untouched', () => {
    expect(sanitizeNoteContent(undefined, 'text')).toBeUndefined();
    expect(sanitizeNoteContent(null, 'text')).toBeNull();
    expect(sanitizeNoteContent('', 'text')).toBe('');
  });
});

describe('the profile — the classic payloads', () => {
  test('event handlers go, the prose stays', () => {
    const out = clean('<p>hi</p><img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('<p>hi</p>');
  });

  test('a javascript: href is stripped, entity- and control-obfuscated alike', () => {
    expect(clean('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
    expect(clean('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(clean('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(clean('<a href="  JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  test('<svg onload> loses the element, not just the handler', () => {
    const out = clean('<svg onload=alert(1)><p>after</p>');
    expect(out).not.toMatch(/svg|onload/i);
    expect(out).toContain('after');
  });

  test('<iframe>, <script> and <form> are removed', () => {
    expect(clean('<iframe src="https://evil.example"></iframe>')).toBe('');
    expect(clean('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
    expect(clean('<form action="//evil"><input type="password"></form>')).toBe('');
  });

  test('style is dropped entirely, so expression() has nowhere to live', () => {
    expect(clean('<div style="width:expression(alert(1))">x</div>')).toBe('<div>x</div>');
  });

  test.each([
    '<math><mtext></mtext><script>alert(1)</script></math>',
    '<form><math><mtext></mtext><form><mglyph><style></math><img src onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<template><s><template><s>&lt;/s&gt;&lt;img src=x onerror=alert(1)&gt;</s></template></s></template>',
  ])('neutralises the mutation-XSS shape %s', (payload) => {
    const out = clean(payload);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out).not.toMatch(/<(svg|math|style|template|noscript|form)\b/i);
  });

  test('images are limited to http(s) and data: rasters', () => {
    expect(clean('<img src="https://ex.example/a.png" alt="a">')).toBe('<img src="https://ex.example/a.png" alt="a">');
    expect(clean('<img src="data:image/png;base64,iVBORw0KGgo=">')).toBe('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(clean('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).toBe('');
    expect(clean('<img src="javascript:alert(1)">')).toBe('');
  });

  test('links are hardened without discarding the rel they already had', () => {
    expect(clean('<a href="https://ex.example">e</a>'))
      .toBe('<a href="https://ex.example" rel="noopener noreferrer" target="_blank">e</a>');
    expect(clean('<a href="https://ex.example" rel="nofollow">e</a>'))
      .toContain('rel="nofollow noopener noreferrer"');
  });
});

describe('round trip — the client and the gateway agree', () => {
  const payloads = [
    '<p>hi</p><img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '<svg onload=alert(1)><p>after</p>',
    '<iframe src="https://evil.example"></iframe>',
    '<form><math><mtext></mtext><form><mglyph><style></math><img src onerror=alert(1)>',
    '<a href="https://ex.example">plain link</a>',
    '<div style="x">styled</div>',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
  ];

  test.each(payloads)('sanitize(sanitize(x)) === sanitize(x) for %s', (payload) => {
    const once = clean(payload);
    expect(clean(once)).toBe(once);
  });

  /**
   * A real TipTap document — the exact string
   * `components/editors/RichTextEditor.jsx` saves, link `rel` and all. It has
   * to come back untouched, or every save would rewrite the note and the
   * editor's dirty-tracking would never settle.
   */
  const TIPTAP_DOC = [
    '<h2>Shipping notes</h2>',
    '<p>Deploy is <strong>green</strong>; see ',
    '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/runbook">the runbook</a>.</p>',
    '<ul><li><p><em>pull</em></p></li><li><p>restart</p></li></ul>',
    '<blockquote><p>Calm code, clear mind.</p></blockquote>',
    '<pre><code class="language-bash">docker ps --format "{{.Names}}"</code></pre>',
    '<hr>',
    '<p><code>a &lt; b &amp;&amp; c &gt; d</code><br><s>dropped</s></p>',
    '<ol start="3"><li><p>third</p></li></ol>',
  ].join('');

  test('a TipTap document is byte-for-byte unchanged', () => {
    expect(clean(TIPTAP_DOC)).toBe(TIPTAP_DOC);
    expect(clean(clean(TIPTAP_DOC))).toBe(TIPTAP_DOC);
  });

  test('sanitizeNoteArgs returns the same object when there is nothing to clean', () => {
    const args = { title: 'x', content: TIPTAP_DOC, type: 'text' };
    expect(sanitizeNoteArgs(args, 'text')).toBe(args);
    const snapshot = { content: '{"nodes":[]}', type: 'mindmap' };
    expect(sanitizeNoteArgs(snapshot, 'mindmap')).toBe(snapshot);
    expect(sanitizeNoteArgs({ title: 'no body' }, 'text')).toEqual({ title: 'no body' });
  });
});

describe('the resolvers actually sanitize', () => {
  test('createNote stores a cleaned body for a text note', async () => {
    const note = await Mutation.createNote(
      null,
      { title: 'pasted', content: '<p>keep</p><img src=x onerror=alert(1)><script>alert(2)</script>', type: 'text' },
      ctx
    );
    expect(note.content).toContain('<p>keep</p>');
    expect(note.content).not.toMatch(/onerror|<script/i);

    const stored = await Note.findById(note._id).lean();
    expect(stored.content).toBe(note.content);
  });

  test('createNote with no type is treated as text, because that is the schema default', async () => {
    const note = await Mutation.createNote(
      null,
      { content: '<p>x</p><script>alert(1)</script>' },
      ctx
    );
    expect(note.type).toBe('text');
    expect(note.content).toBe('<p>x</p>');
  });

  test('createNote leaves a mindmap snapshot alone', async () => {
    const snapshot = JSON.stringify({ nodes: [{ id: '1', data: { label: '<b>a</b> & b' } }], edges: [] });
    const note = await Mutation.createNote(null, { content: snapshot, type: 'mindmap' }, ctx);
    expect(note.content).toBe(snapshot);
    expect(JSON.parse(note.content).nodes[0].data.label).toBe('<b>a</b> & b');
  });

  test('updateNote sanitizes the new body', async () => {
    const note = await Mutation.createNote(null, { content: '<p>start</p>', type: 'text' }, ctx);
    const updated = await Mutation.updateNote(
      null,
      { id: String(note._id), content: '<p>next</p><a href="javascript:alert(1)">x</a>', type: 'text' },
      ctx
    );
    expect(updated.content).toBe('<p>next</p><a>x</a>');
  });

  test('updateNote that omits type still sanitizes, by reading the stored type', async () => {
    // No notegeek client does this — `NoteEditorPage` always sends `type` —
    // but the argument is optional, and a hole a hand-rolled request can walk
    // through is still a hole.
    const note = await Mutation.createNote(null, { content: '<p>start</p>', type: 'text' }, ctx);
    const updated = await Mutation.updateNote(
      null,
      { id: String(note._id), content: '<p>next</p><img src=x onerror=alert(1)>' },
      ctx
    );
    expect(updated.content).not.toMatch(/onerror/i);
    expect(updated.content).toContain('<p>next</p>');
  });

  test('updateNote that omits type does NOT mangle a snapshot note', async () => {
    const snapshot = JSON.stringify({ nodes: [{ id: '1', data: { label: 'a < b' } }], edges: [] });
    const note = await Mutation.createNote(null, { content: '{"nodes":[],"edges":[]}', type: 'handwritten' }, ctx);
    const updated = await Mutation.updateNote(null, { id: String(note._id), content: snapshot }, ctx);
    expect(updated.content).toBe(snapshot);
  });

  test('a title-only update needs no type lookup and changes no body', async () => {
    const note = await Mutation.createNote(null, { content: '<p>body</p>', type: 'text' }, ctx);
    const updated = await Mutation.updateNote(null, { id: String(note._id), title: 'renamed' }, ctx);
    expect(updated.title).toBe('renamed');
    expect(updated.content).toBe('<p>body</p>');
  });
});
