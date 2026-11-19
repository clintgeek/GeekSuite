// A tiny, valid EPUB 3 built in memory for the reader scenes — the harness
// has no real book file and no zip library, so this writes an uncompressed
// ("stored") zip by hand: local headers, a central directory, CRC-32s.
// The mimetype entry is first and stored, as the EPUB spec requires.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(0, 10); // time + date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, end]);
}

const PARAGRAPH =
  'The store opened at ten, and by ten past the first regular was already in the back aisle, ' +
  'running a finger along the spines of the paperbacks as if the titles might have changed overnight. ' +
  'Some of them had: a box of estate-sale hardcovers had come in on Tuesday, still smelling of cedar ' +
  'and pipe smoke, and the owner had shelved them without pricing half of them.';

const chapter = (id, title, paragraphs) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title}</title></head>
<body>
<h1 id="${id}">${title}</h1>
${Array.from({ length: paragraphs }, (_, i) => `<p>${PARAGRAPH}${i === 1 ? ' <a href="ch2.xhtml#ch2">See chapter two</a>.' : ''}</p>`).join('\n')}
</body>
</html>`;

/** An EPUB 3 of three short chapters with a nav document (for Contents). */
export function sampleEpub({ title = 'Lock In' } = {}) {
  const chapters = [
    ['ch1', 'The Front Counter', 6],
    ['ch2', 'The Back Aisle', 8],
    ['ch3', 'Closing Time', 5],
  ];
  const files = [
    { name: 'mimetype', data: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    {
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:5f1c7c1e-harness-0000-0000-000000000001</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-18T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapters.map(([id]) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${chapters.map(([id]) => `<itemref idref="${id}"/>`).join('\n    ')}
  </spine>
</package>`,
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc"><ol>
${chapters.map(([id, t]) => `<li><a href="${id}.xhtml#${id}">${t}</a></li>`).join('\n')}
</ol></nav>
</body>
</html>`,
    },
    ...chapters.map(([id, t, n]) => ({ name: `OEBPS/${id}.xhtml`, data: chapter(id, t, n) })),
  ];
  return storedZip(files);
}
