/**
 * Feed parsing: RSS 2.0, Atom 1.0 and NWS alerts (api.weather.gov GeoJSON)
 * into one raw item shape. No normalization here beyond picking fields —
 * src/ingest/normalize.js does the cleaning.
 *
 * Raw item: { guid, link, title, summary, content, author, date, expires,
 *             sourceName, sourceUrl }
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export class FeedParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeedParseError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ['item', 'entry', 'link', 'category', 'author'].includes(name),
});

/** Text of a node that may be a string, a {#text} object, or absent. */
function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']).trim();
  return '';
}

function first(...vals) {
  for (const v of vals) {
    const t = text(v);
    if (t) return t;
  }
  return '';
}

function rssItem(it) {
  const links = Array.isArray(it.link) ? it.link : [it.link];
  const link = first(...links, it['atom:link']?.['@_href']);
  const authors = Array.isArray(it.author) ? it.author : [it.author];
  return {
    guid: first(it.guid),
    link,
    title: first(it.title),
    summary: first(it.description, it.summary),
    content: first(it['content:encoded'], it.content),
    author: first(it['dc:creator'], ...authors),
    date: first(it.pubDate, it['dc:date'], it.published, it.updated),
    expires: '',
    sourceName: first(it.source),
    sourceUrl: typeof it.source === 'object' ? (it.source['@_url'] || '') : '',
  };
}

function atomLink(entry) {
  const links = entry.link || [];
  const pick = links.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate') && l['@_href'])
    || links.find((l) => typeof l === 'object' && l['@_href']);
  if (pick) return pick['@_href'];
  return first(...links);
}

function atomItem(e) {
  const author = (e.author || [])[0];
  return {
    guid: first(e.id),
    link: atomLink(e),
    title: first(e.title),
    summary: first(e.summary),
    content: first(e.content),
    author: author && typeof author === 'object' ? first(author.name) : first(author),
    date: first(e.published, e.updated, e.issued),
    expires: '',
    sourceName: '',
    sourceUrl: '',
  };
}

function parseXml(body) {
  const check = XMLValidator.validate(body);
  if (check !== true) {
    throw new FeedParseError(`malformed XML: ${check.err?.msg || 'invalid'} (line ${check.err?.line ?? '?'})`);
  }
  const doc = parser.parse(body);
  if (doc.rss || doc['rdf:RDF']) {
    const root = doc.rss || doc['rdf:RDF'];
    const channel = root.channel || {};
    const items = root.item || channel.item || [];
    return { kind: 'rss', title: first(channel.title), items: items.map(rssItem) };
  }
  if (doc.feed) {
    return { kind: 'atom', title: first(doc.feed.title), items: (doc.feed.entry || []).map(atomItem) };
  }
  throw new FeedParseError('not an RSS or Atom document');
}

/**
 * NWS alerts: each GeoJSON feature is one alert. The web link is the
 * alert's own `@id` (an api.weather.gov URL that renders the alert);
 * `expires` is when the alert leaves the briefing (`ends` wins when set —
 * `expires` is when the *message* expires, `ends` when the hazard does).
 */
function parseNws(body) {
  let doc;
  try {
    doc = JSON.parse(body);
  } catch {
    throw new FeedParseError('malformed JSON');
  }
  if (!doc || !Array.isArray(doc.features)) throw new FeedParseError('not an NWS alerts collection');
  const items = doc.features.map((f) => {
    const p = f?.properties || {};
    const link = p['@id'] || f.id || '';
    return {
      guid: p.id || f.id || link,
      link,
      title: p.headline || p.event || '',
      summary: p.description || '',
      content: '',
      author: p.senderName || '',
      date: p.sent || p.effective || p.onset || '',
      expires: p.ends || p.expires || '',
      sourceName: '',
      sourceUrl: '',
    };
  });
  return { kind: 'nws', title: doc.title || 'NWS alerts', items };
}

/**
 * @param {string} body
 * @param {'rss'|'atom'|'nws'} format  the feed's declared format; rss/atom are
 *   sniffed from the document (sites mislabel them), nws is JSON.
 */
export function parseFeed(body, format = 'rss') {
  const s = String(body ?? '').replace(/^\uFEFF/, '').trim();
  if (!s) throw new FeedParseError('empty body');
  if (format === 'nws') return parseNws(s);
  return parseXml(s);
}

export default { parseFeed, FeedParseError };
