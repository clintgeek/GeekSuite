import { describe, it, expect } from 'vitest';
import {
  IMPORT_MAX_BYTES,
  TITLE_MAX,
  isImportableFile,
  noteFromMarkdown,
  partitionImportFiles,
  readImportFile,
  titleFromFilename,
} from '../../utils/importMarkdown';

/**
 * Markdown import (DOCS/CONTEXT.md §9): which files, what title, what body,
 * and what is refused before anything is sent.
 */
const file = (name, body = 'x', type = '') => new File([body], name, { type });

describe('which files import', () => {
  it('takes .md, .markdown and .txt by name, whatever the browser says the type is', () => {
    expect(isImportableFile(file('a.md'))).toBe(true);
    expect(isImportableFile(file('A.MARKDOWN'))).toBe(true);
    expect(isImportableFile(file('notes.txt'))).toBe(true);
    // Android hands a .md over as octet-stream.
    expect(isImportableFile(file('trip.md', 'x', 'application/octet-stream'))).toBe(true);
  });

  it('takes a text MIME type with no useful name', () => {
    expect(isImportableFile(file('clipboard', 'x', 'text/markdown'))).toBe(true);
    expect(isImportableFile(file('blob', 'x', 'text/plain'))).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isImportableFile(file('photo.png', 'x', 'image/png'))).toBe(false);
    expect(isImportableFile(file('doc.pdf', 'x', 'application/pdf'))).toBe(false);
    expect(isImportableFile(file('notes.md.zip', 'x', 'application/zip'))).toBe(false);
    expect(isImportableFile(file('page.html', 'x', 'text/html'))).toBe(false);
    expect(isImportableFile(null)).toBe(false);
  });

  it('partitions a drop, keeping order', () => {
    const a = file('a.md');
    const b = file('b.png', 'x', 'image/png');
    const c = file('c.txt');
    const { accepted, rejected } = partitionImportFiles([a, b, c]);
    expect(accepted).toEqual([a, c]);
    expect(rejected).toEqual([b]);
  });
});

describe('title and body', () => {
  it('takes the opening # heading as the title and removes it from the body', () => {
    expect(noteFromMarkdown('# Trip plan\n\nDay one: Lisbon.\n', 'x.md')).toEqual({
      title: 'Trip plan',
      content: 'Day one: Lisbon.\n',
    });
  });

  it('allows blank lines before the heading and a closing ###', () => {
    expect(noteFromMarkdown('\n\n#   Roof quote  ##\nbody', 'x.md')).toEqual({ title: 'Roof quote', content: 'body' });
  });

  it('takes a setext heading too', () => {
    expect(noteFromMarkdown('Groceries\n=========\n\n- milk', 'x.md')).toEqual({ title: 'Groceries', content: '- milk' });
  });

  it('falls back to the filename when the file does not open with a # heading', () => {
    const src = 'Intro paragraph.\n\n# Later heading\n';
    expect(noteFromMarkdown(src, 'Meeting notes.md')).toEqual({ title: 'Meeting notes', content: src });
    // `##` is not a title.
    expect(noteFromMarkdown('## Section\ntext', 'deploy.markdown').title).toBe('deploy');
    // `#tag` (no space) is not a heading.
    expect(noteFromMarkdown('#todo buy milk', 'list.txt').title).toBe('list');
  });

  it('keeps YAML front matter and still finds the heading after it', () => {
    const src = '---\ntags: [a]\n---\n# Title\n\nBody';
    expect(noteFromMarkdown(src, 'x.md')).toEqual({ title: 'Title', content: '---\ntags: [a]\n---\nBody' });
  });

  it('normalises CRLF and drops a byte order mark', () => {
    expect(noteFromMarkdown('﻿# T\r\n\r\nline one\r\nline two', 'x.md')).toEqual({ title: 'T', content: 'line one\nline two' });
  });

  it('a file that is only a heading keeps it as the body (the gateway refuses an empty one)', () => {
    expect(noteFromMarkdown('# Just a title\n', 'x.md')).toEqual({ title: 'Just a title', content: '# Just a title\n' });
  });

  it('caps the title at the gateway limit', () => {
    const long = 'a'.repeat(TITLE_MAX + 50);
    expect(noteFromMarkdown(`# ${long}\nbody`, 'x.md').title).toHaveLength(TITLE_MAX);
  });

  it('names from the filename, extension off', () => {
    expect(titleFromFilename('Trip notes.md')).toBe('Trip notes');
    expect(titleFromFilename('archive.v2.markdown')).toBe('archive.v2');
    expect(titleFromFilename('.md')).toBe('Imported note');
    expect(titleFromFilename('')).toBe('Imported note');
  });
});

describe('reading a file', () => {
  it('decodes UTF-8, accents and emoji intact', async () => {
    const bytes = new TextEncoder().encode('# Café ☕\n\nnaïve résumé 🚀');
    const note = await readImportFile(new File([bytes], 'c.md'));
    expect(note).toEqual({ title: 'Café ☕', content: 'naïve résumé 🚀' });
  });

  it('refuses a file over 1 MB before reading it', async () => {
    const big = { name: 'huge.md', size: IMPORT_MAX_BYTES + 1, arrayBuffer: () => { throw new Error('read'); } };
    await expect(readImportFile(big)).rejects.toThrow(/huge\.md is 1\.0 MB/);
  });

  it('refuses a body over the gateway\'s 100 000 characters', async () => {
    await expect(readImportFile(file('long.md', 'x'.repeat(100_001)))).rejects.toThrow(/too long for one note/);
  });

  it('a body at the limit goes through', async () => {
    await expect(readImportFile(file('ok.md', 'x'.repeat(100_000)))).resolves.toMatchObject({ title: 'ok' });
  });

  it('refuses an empty file', async () => {
    await expect(readImportFile(file('blank.md', '  \n\n'))).rejects.toThrow('blank.md is empty.');
  });
});
