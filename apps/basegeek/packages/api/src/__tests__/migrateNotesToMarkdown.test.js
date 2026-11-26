/** The one-time rich text → markdown conversion (scripts/migrate-notes-to-markdown.js). */
const { htmlToMarkdown } = await import('../../scripts/migrate-notes-to-markdown.js');

describe('htmlToMarkdown', () => {
  test('paragraphs, links and line breaks', () => {
    expect(htmlToMarkdown('<p>One</p><p>Two <a href="https://x.test/a">here</a><br>next line</p>'))
      .toBe('One\n\nTwo [here](https://x.test/a)\nnext line');
    expect(htmlToMarkdown('<p><a href="https://x.test">https://x.test</a></p>')).toBe('https://x.test');
  });

  test('emphasis, headings, lists, code and quotes', () => {
    expect(htmlToMarkdown('<h2>Title</h2><p><strong>bold</strong> and <em>soft</em> and <code>ls -la</code></p>'))
      .toBe('## Title\n\n**bold** and *soft* and `ls -la`');
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>')).toBe('- a\n- b\n\n1. x\n2. y');
    expect(htmlToMarkdown('<pre>line 1\n  line 2\n</pre>')).toBe('```\nline 1\n  line 2\n```');
    expect(htmlToMarkdown('<blockquote><p>said</p></blockquote>')).toBe('> said');
  });

  test('unknown tags lose the tag and keep the words; entities are decoded; plain text passes through', () => {
    expect(htmlToMarkdown('<p><span style="color:red">red</span> &amp; <u>under</u>&nbsp;x</p>')).toBe('red & under x');
    expect(htmlToMarkdown('just words')).toBe('just words');
    expect(htmlToMarkdown('')).toBe('');
  });
});
