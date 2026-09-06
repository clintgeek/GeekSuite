/**
 * sanitizeNoteHtml — the render-side half of notegeek's stored-XSS fix.
 *
 * `NoteViewer` hands a `type: 'text'` note's stored body to
 * `dangerouslySetInnerHTML`. Until this existed, that body was whatever had
 * been saved — TipTap output for a note the user typed, but anything at all
 * for a note whose content arrived by paste or import. These tests pin both
 * halves of the contract: the classic payloads die, and a real TipTap
 * document comes back byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { sanitizeNoteHtml } from '../../utils/sanitizeNoteHtml';

/** Every assertion below also has to hold for the sanitizer's own output. */
const expectStable = (html) => {
    const once = sanitizeNoteHtml(html);
    expect(sanitizeNoteHtml(once)).toBe(once);
    return once;
};

describe('sanitizeNoteHtml — the classic payloads', () => {
    it('drops an onerror handler and keeps nothing that can fire it', () => {
        const out = expectStable('<p>hi</p><img src=x onerror=alert(1)>');
        expect(out).not.toMatch(/onerror/i);
        expect(out).toContain('<p>hi</p>');
    });

    it('strips a javascript: href, leaving the link text', () => {
        const out = expectStable('<a href="javascript:alert(1)">click</a>');
        expect(out).not.toMatch(/javascript:/i);
        expect(out).toBe('<a>click</a>');
    });

    it('strips a javascript: href hidden behind an HTML entity', () => {
        const out = expectStable('<a href="&#106;avascript:alert(1)">x</a>');
        expect(out).toBe('<a>x</a>');
    });

    it('strips a javascript: href hidden behind control characters', () => {
        // A browser ignores the tab when it resolves the URL; so does the
        // sanitizer, which is the point of `unwrapUrl`.
        const out = expectStable('<a href="java\tscript:alert(1)">x</a>');
        expect(out).toBe('<a>x</a>');
        expect(expectStable('<a href="  JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
    });

    it('removes an <svg> wholesale rather than only its onload', () => {
        const out = expectStable('<svg onload=alert(1)><p>after</p>');
        expect(out).not.toMatch(/svg|onload/i);
        expect(out).toContain('after');
    });

    it('removes an <iframe> and its src', () => {
        expect(expectStable('<iframe src="https://evil.example"></iframe>')).toBe('');
    });

    it('removes <script> and its contents, keeping the prose around it', () => {
        const out = expectStable('<p>ok</p><script>alert(1)</script>');
        expect(out).toBe('<p>ok</p>');
    });

    it('drops style entirely, so expression() has nowhere to live', () => {
        const out = expectStable('<div style="width:expression(alert(1))">x</div>');
        expect(out).toBe('<div>x</div>');
        expect(expectStable('<p style="position:fixed;inset:0">y</p>')).toBe('<p>y</p>');
    });

    it('drops form controls, which cannot be styled out of a note body', () => {
        expect(expectStable('<form action="//evil"><input name="p" type="password"></form>')).toBe('');
    });
});

describe('sanitizeNoteHtml — mutation XSS (DOMPurify\'s own bypass corpus)', () => {
    // These are the shapes that broke earlier releases: markup whose meaning
    // changes when the browser re-parses the serialized output. They are the
    // reason this uses DOMPurify rather than a regex over `<script>`.
    const mutations = [
        '<math><mtext></mtext><script>alert(1)</script></math>',
        '<form><math><mtext></mtext><form><mglyph><style></math><img src onerror=alert(1)>',
        '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
        '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
        '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&#11;src=1&#11;onerror=alert(1)&gt;">',
        '<template><s><template><s>&lt;/s&gt;&lt;img src=x onerror=alert(1)&gt;</s></template></s></template>',
    ];

    it.each(mutations)('neutralises %s', (payload) => {
        const out = expectStable(payload);
        expect(out).not.toMatch(/<script/i);
        expect(out).not.toMatch(/\son[a-z]+\s*=/i);
        expect(out).not.toMatch(/<(svg|math|style|template|noscript|form)\b/i);
    });
});

describe('sanitizeNoteHtml — images', () => {
    it('keeps an http(s) image', () => {
        expect(expectStable('<img src="https://ex.example/a.png" alt="a">'))
            .toBe('<img src="https://ex.example/a.png" alt="a">');
    });

    it('keeps a data: raster image', () => {
        const src = 'data:image/png;base64,iVBORw0KGgo=';
        expect(expectStable(`<img src="${ src }">`)).toBe(`<img src="${ src }">`);
    });

    it('drops a data:image/svg+xml image whole, not just its src', () => {
        expect(expectStable('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).toBe('');
    });

    it('drops an image with a javascript: src', () => {
        expect(expectStable('<img src="javascript:alert(1)">')).toBe('');
    });

    it('drops an image with no src rather than leaving a broken box', () => {
        expect(expectStable('<img alt="gone">')).toBe('');
    });
});

describe('sanitizeNoteHtml — link hardening', () => {
    it('adds rel="noopener noreferrer" and target to a bare link', () => {
        expect(expectStable('<a href="https://ex.example">e</a>'))
            .toBe('<a href="https://ex.example" rel="noopener noreferrer" target="_blank">e</a>');
    });

    it('augments an existing rel instead of replacing it', () => {
        // TipTap's Link default is `noopener noreferrer nofollow`; rewriting
        // it would make a freshly saved note change under sanitization.
        const out = expectStable('<a href="https://ex.example" rel="nofollow">e</a>');
        expect(out).toContain('rel="nofollow noopener noreferrer"');
    });

    it('leaves a relative link and an anchor alone', () => {
        expect(expectStable('<a href="/notes/1">n</a>'))
            .toBe('<a href="/notes/1" rel="noopener noreferrer" target="_blank">n</a>');
        expect(expectStable('<a href="#top">t</a>'))
            .toBe('<a href="#top" rel="noopener noreferrer" target="_blank">t</a>');
    });

    it('allows mailto: and tel:', () => {
        expect(expectStable('<a href="mailto:a@b.example">m</a>')).toContain('mailto:a@b.example');
        expect(expectStable('<a href="tel:+15550100">t</a>')).toContain('tel:+15550100');
    });

    it('refuses a data: href even though data: images are allowed', () => {
        expect(expectStable('<a href="data:text/html,<script>alert(1)</script>">d</a>'))
            .toBe('<a>d</a>');
    });
});

describe('sanitizeNoteHtml — the formatting a note is allowed to keep', () => {
    it('preserves headings, lists, quotes, code blocks, rules and tables', () => {
        const html = [
            '<h1>One</h1><h2>Two</h2><h3>Three</h3>',
            '<p>Body with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s> and <code>code</code>.</p>',
            '<ul><li>a</li><li>b</li></ul><ol start="3"><li>c</li></ol>',
            '<blockquote><p>quoted</p></blockquote>',
            '<pre><code class="language-js">const a = 1;</code></pre>',
            '<hr>',
            '<table><thead><tr><th scope="col">h</th></tr></thead><tbody><tr><td colspan="2">d</td></tr></tbody></table>',
        ].join('');
        expect(expectStable(html)).toBe(html);
    });

    it('escapes text that looks like markup instead of losing it', () => {
        expect(expectStable('<p>a &lt; b &amp;&amp; c &gt; d</p>')).toBe('<p>a &lt; b &amp;&amp; c &gt; d</p>');
    });

    it('returns "" for anything that is not a non-empty string', () => {
        expect(sanitizeNoteHtml(undefined)).toBe('');
        expect(sanitizeNoteHtml(null)).toBe('');
        expect(sanitizeNoteHtml('')).toBe('');
        expect(sanitizeNoteHtml(42)).toBe('');
    });
});

describe('sanitizeNoteHtml — a real TipTap document survives byte-for-byte', () => {
    /**
     * Not a hand-written fixture: this runs the same extension set
     * `components/editors/RichTextEditor.jsx` configures, so the string under
     * test is literally what `editor.getHTML()` would save. If a future
     * extension starts emitting an element or attribute the profile does not
     * allow, this test is what says so.
     */
    const tiptapHtml = () => {
        const editor = new Editor({
            element: document.createElement('div'),
            extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline],
            content: [
                '<h2>Shipping notes</h2>',
                '<p>Deploy is <strong>green</strong>; see ',
                '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/runbook">the runbook</a>.</p>',
                '<ul><li><p><em>pull</em></p></li><li><p><u>restart</u></p></li></ul>',
                '<blockquote><p>Calm code, clear mind.</p></blockquote>',
                '<pre><code class="language-bash">docker ps --format "{{.Names}}"</code></pre>',
                '<hr>',
                '<p><code>a &lt; b &amp;&amp; c &gt; d</code><br><s>dropped</s></p>',
                '<ol start="3"><li><p>third</p></li></ol>',
            ].join(''),
        });
        const html = editor.getHTML();
        editor.destroy();
        return html;
    };

    it('is unchanged by the sanitizer', () => {
        const html = tiptapHtml();
        // Guard the guard: an empty document would pass vacuously.
        expect(html).toContain('Shipping notes');
        expect(html).toContain('href="https://example.com/runbook"');
        expect(sanitizeNoteHtml(html)).toBe(html);
    });

    it('is still unchanged on a second pass (save then render)', () => {
        const html = tiptapHtml();
        expect(sanitizeNoteHtml(sanitizeNoteHtml(html))).toBe(html);
    });
});
