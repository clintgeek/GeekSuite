const { Buffer } = require('buffer');

/**
 * Minimal ZIP writer (STORE/no compression) to build EPUBs without deps
 */
class ZipWriter {
  constructor() {
    this.files = [];
    this.offset = 0;
    this.chunks = [];
  }

  static crc32(buf) {
    let table = ZipWriter._crcTable;
    if (!table) {
      table = ZipWriter._crcTable = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
      }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
  }

  addFile(name, content, mimeType = null) {
    const date = new Date();
    const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | ((date.getSeconds() / 2) | 0)) & 0xFFFF;
    const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;

    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = ZipWriter.crc32(data);
    const compSize = data.length; // store
    const uncompSize = data.length;
    const nameBuf = Buffer.from(name, 'utf8');

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    let p = 0;
    localHeader.writeUInt32LE(0x04034b50, p); p += 4; // local file header signature
    localHeader.writeUInt16LE(20, p); p += 2; // version needed to extract
    localHeader.writeUInt16LE(0, p); p += 2; // general purpose bit flag
    localHeader.writeUInt16LE(0, p); p += 2; // compression method (0 = store)
    localHeader.writeUInt16LE(dosTime, p); p += 2; // last mod file time
    localHeader.writeUInt16LE(dosDate, p); p += 2; // last mod file date
    localHeader.writeUInt32LE(crc, p); p += 4; // crc-32
    localHeader.writeUInt32LE(compSize, p); p += 4; // compressed size
    localHeader.writeUInt32LE(uncompSize, p); p += 4; // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, p); p += 2; // file name length
    localHeader.writeUInt16LE(0, p); p += 2; // extra field length
    nameBuf.copy(localHeader, p);

    this.chunks.push(localHeader, data);

    const fileRecord = {
      name,
      nameBuf,
      crc,
      compSize,
      uncompSize,
      localHeaderOffset: this.offset,
      dosTime,
      dosDate,
    };
    this.offset += localHeader.length + data.length;
    this.files.push(fileRecord);
  }

  toBuffer() {
    // Central directory
    const centralChunks = [];
    let centralSize = 0;
    for (const f of this.files) {
      const hdr = Buffer.alloc(46 + f.nameBuf.length);
      let p = 0;
      hdr.writeUInt32LE(0x02014b50, p); p += 4; // central file header signature
      hdr.writeUInt16LE(20, p); p += 2; // version made by
      hdr.writeUInt16LE(20, p); p += 2; // version needed to extract
      hdr.writeUInt16LE(0, p); p += 2; // general purpose bit flag
      hdr.writeUInt16LE(0, p); p += 2; // compression method
      hdr.writeUInt16LE(f.dosTime, p); p += 2; // mod time
      hdr.writeUInt16LE(f.dosDate, p); p += 2; // mod date
      hdr.writeUInt32LE(f.crc, p); p += 4; // crc
      hdr.writeUInt32LE(f.compSize, p); p += 4; // comp size
      hdr.writeUInt32LE(f.uncompSize, p); p += 4; // uncomp size
      hdr.writeUInt16LE(f.nameBuf.length, p); p += 2; // file name length
      hdr.writeUInt16LE(0, p); p += 2; // extra field length
      hdr.writeUInt16LE(0, p); p += 2; // file comment length
      hdr.writeUInt16LE(0, p); p += 2; // disk number start
      hdr.writeUInt16LE(0, p); p += 2; // internal file attributes
      hdr.writeUInt32LE(0, p); p += 4; // external file attributes
      hdr.writeUInt32LE(f.localHeaderOffset, p); p += 4; // relative offset
      f.nameBuf.copy(hdr, p);
      centralChunks.push(hdr);
      centralSize += hdr.length;
    }

    const end = Buffer.alloc(22);
    let p = 0;
    end.writeUInt32LE(0x06054b50, p); p += 4; // end of central dir signature
    end.writeUInt16LE(0, p); p += 2; // number of this disk
    end.writeUInt16LE(0, p); p += 2; // disk where central directory starts
    end.writeUInt16LE(this.files.length, p); p += 2; // number of central dir records on this disk
    end.writeUInt16LE(this.files.length, p); p += 2; // total number of central dir records
    end.writeUInt32LE(centralSize, p); p += 4; // size of central directory
    end.writeUInt32LE(this.offset, p); p += 4; // offset of start of central directory
    end.writeUInt16LE(0, p); p += 2; // .ZIP file comment length

    return Buffer.concat([...this.chunks, ...centralChunks, end]);
  }
}

function xhtmlDoc(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
<body>
${body}
</body>
</html>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function makeCoverSvg(title, subtitle = '') {
  const safeTitle = escapeXml(title);
  const safeSub = escapeXml(subtitle);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f1c2e"/>
      <stop offset="100%" stop-color="#213b69"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="45%" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="96" font-weight="700">${safeTitle}</text>
  <text x="50%" y="52%" text-anchor="middle" fill="#c0d0f0" font-family="Georgia, serif" font-size="40">${safeSub}</text>
  <text x="50%" y="92%" text-anchor="middle" fill="#b0c4de" font-family="Georgia, serif" font-size="36">StoryGeek</text>
  <rect x="200" y="2200" width="1200" height="10" fill="#3a5fa0"/>
</svg>`;
}

async function createEpub({ title, author = 'Unknown', genre = '', content }) {
  const zip = new ZipWriter();

  // Required order: mimetype must be first and STORED
  zip.addFile('mimetype', 'application/epub+zip');

  // Container
  zip.addFile('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // Assets
  zip.addFile('OEBPS/style.css', `body{font-family: serif; line-height:1.5; margin: 0 5%;}
h1,h2{font-family: Georgia, serif;}
.title{margin-top:20%; text-align:center}
`);

  // Cover SVG and XHTML wrapper
  const coverSvg = makeCoverSvg(title, genre);
  zip.addFile('OEBPS/cover.svg', coverSvg);
  zip.addFile('OEBPS/cover.xhtml', xhtmlDoc('Cover', `<div class="title"><img src="cover.svg" alt="Cover"/></div>`));

  // Nav.xhtml (EPUB3)
  zip.addFile('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      <li><a href="cover.xhtml">Cover</a></li>
      <li><a href="chapter1.xhtml">Chapter 1</a></li>
    </ol>
  </nav>
</body>
</html>`);

  // Chapter content
  const chapterBody = `<h1>${escapeXml(title)}</h1>\n${content.split('\n').map(p => `<p>${escapeXml(p)}</p>`).join('\n')}`;
  zip.addFile('OEBPS/chapter1.xhtml', xhtmlDoc(title, chapterBody));

  // content.opf
  const now = new Date().toISOString();
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${Date.now()}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>${now}</dc:date>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="coverx" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="coverx"/>
    <itemref idref="chap1"/>
  </spine>
</package>`;
  zip.addFile('OEBPS/content.opf', opf);

  return zip.toBuffer();
}

module.exports = { createEpub };


