import { describe, it, expect } from 'vitest';
import {
  BOOK_FILE_ACCEPT, comicDownloadFormat, comicKind, comicLine, downloadRows, fileFormat, hasComicFile, isAsIsFormat, volumeLabel,
} from '../../utils/comic';

const file = (format, size = 1000) => ({ format, path: `/data/library/x.${format.toLowerCase()}`, size });

describe('comics and manga', () => {
  it('reads a file\'s format from the stored field, else the extension', () => {
    expect(fileFormat({ format: 'CBZ' })).toBe('cbz');
    expect(fileFormat({ path: 'uploads/b1/Vol 01.CBR' })).toBe('cbr');
    expect(fileFormat({})).toBe('');
  });

  it('knows a comic by its file: every common archive', () => {
    for (const format of ['CBZ', 'cbr', 'CB7', 'cbt']) {
      expect(hasComicFile({ files: [file(format)] })).toBe(true);
      expect(comicKind({ files: [file(format)] })).toBe('Comic');
    }
    expect(comicKind({ files: [file('EPUB')] })).toBeNull();
    expect(comicKind({ files: [file('PDF')] })).toBeNull();
    expect(comicKind({})).toBeNull();
  });

  it('calls it Manga when the tags say so, whatever the file is', () => {
    expect(comicKind({ files: [file('CBZ')], libraryTags: ['Manga'] })).toBe('Manga');
    expect(comicKind({ files: [file('PDF')], myTags: ['shonen manga'] })).toBe('Manga');
    expect(comicKind({ files: [], unsortedTags: ['Manhwa'] })).toBe('Manga');
  });

  it('does not mistake a humour shelf for comics', () => {
    expect(comicKind({ files: [file('EPUB')], libraryTags: ['Comic fantasy'] })).toBeNull();
    expect(comicKind({ files: [file('EPUB')], libraryTags: ['Graphic novels'] })).toBe('Comic');
  });

  it('labels the volume from the series index', () => {
    expect(volumeLabel({ series: { name: 'Berserk', index: 3 } })).toBe('Vol. 3');
    expect(volumeLabel({ series: { name: 'Berserk', index: 3.5 } })).toBe('Vol. 3.5');
    expect(volumeLabel({ series: { name: 'Berserk' } })).toBeNull();
    expect(volumeLabel({})).toBeNull();
  });

  it('builds the card line, and none for an ordinary book', () => {
    expect(comicLine({ files: [file('CBZ')], libraryTags: ['Manga'], series: { index: 12 } })).toBe('Manga · Vol. 12');
    expect(comicLine({ files: [file('CBR')] })).toBe('Comic');
    expect(comicLine({ files: [file('EPUB')], series: { index: 2 } })).toBeNull();
  });

  it('offers the pickers the comic archives', () => {
    for (const ext of ['.cbz', '.cbr', '.cb7', '.cbt', '.epub', '.pdf']) {
      expect(BOOK_FILE_ACCEPT.split(',')).toContain(ext);
    }
  });

  describe('the download sheet\'s rows', () => {
    it('an ordinary book keeps exactly the three ebook formats', () => {
      const rows = downloadRows({ files: [file('EPUB')] });
      expect(rows.map((r) => r.format)).toEqual(['epub', 'azw3', 'mobi']);
      expect(rows.every((r) => !r.asIs)).toBe(true);
      expect(rows[0].file).toBeTruthy();
      expect(rows[1].file).toBeNull();
    });

    it('a book with no file at all still offers the three', () => {
      expect(downloadRows({ files: [] }).map((r) => r.format)).toEqual(['epub', 'azw3', 'mobi']);
    });

    it('a comic offers its own file and nothing to convert', () => {
      const rows = downloadRows({ files: [file('CBZ', 250_000_000)] });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ format: 'cbz', asIs: true });
      expect(rows[0].file.size).toBe(250_000_000);
    });

    it('a book with both lists the as-is file first, then the ebooks', () => {
      const rows = downloadRows({ files: [file('EPUB'), file('PDF'), file('CBZ')] });
      expect(rows.map((r) => r.format)).toEqual(['cbz', 'pdf', 'epub', 'azw3', 'mobi']);
    });

    it('never offers an as-is format the book does not have', () => {
      expect(downloadRows({ files: [file('EPUB')] }).some((r) => isAsIsFormat(r.format))).toBe(false);
    });
  });

  describe("the file a comic's Download button hands over", () => {
    it('prefers the comic archive, then PDF, then EPUB', () => {
      expect(comicDownloadFormat({ files: [file('EPUB'), file('PDF'), file('CBZ')] })).toBe('cbz');
      expect(comicDownloadFormat({ files: [file('EPUB'), file('PDF')] })).toBe('pdf');
      expect(comicDownloadFormat({ files: [file('MOBI'), file('EPUB')] })).toBe('epub');
    });

    it('falls back to whatever file there is, and to null with none', () => {
      expect(comicDownloadFormat({ files: [file('MOBI')] })).toBe('mobi');
      expect(comicDownloadFormat({ files: [] })).toBeNull();
      expect(comicDownloadFormat({})).toBeNull();
    });
  });
});

describe('the Add-book choice writes tags that comicKind recognises', () => {
  it('Manga and Comics, on a plain EPUB', async () => {
    const { COMIC_KIND_TAGS } = await import('../../utils/comic');
    const epub = [{ format: 'EPUB', path: 'x.epub' }];
    expect(comicKind({ files: epub, tags: [COMIC_KIND_TAGS.manga] })).toBe('Manga');
    expect(comicKind({ files: epub, tags: [COMIC_KIND_TAGS.comic] })).toBe('Comic');
  });
});
