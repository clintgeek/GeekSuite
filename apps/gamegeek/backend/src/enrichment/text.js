/**
 * Provider text → plain text. Steam's `short_description` carries HTML tags
 * and entities (`&quot;Perpetual Testing Initiative&quot;`), RAWG's
 * `description` is HTML; the schema field is plain text capped at
 * bounds.description.maxlength (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md
 * §What gets filled). Pure.
 */
import constantsModule from '@geeksuite/schemas/gamegeek/constants';

const { bounds } = constantsModule;

export const DESCRIPTION_MAX = bounds.description.maxlength;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  trade: '™',
  reg: '®',
  copy: '©',
  bull: '•',
  eacute: 'é',
};

/** `&quot;` `&#39;` `&#x27;` → characters. Unknown named entities are left as written. */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/**
 * HTML → plain text: block-ish tags become spaces (so "a<br>b" doesn't glue
 * into "ab"), every tag is dropped, entities decoded, whitespace collapsed,
 * then capped at `max` characters.
 */
export function toPlainText(html, max = DESCRIPTION_MAX) {
  const noTags = String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  const text = decodeEntities(noTags).replace(/\s+/g, ' ').trim();
  return capText(text, max);
}

/** Cap at `max` characters, cutting at a word boundary with an ellipsis when it has to cut. */
export function capText(text, max = DESCRIPTION_MAX) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const hard = s.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(' ');
  const cut = lastSpace > max * 0.8 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}

export default { decodeEntities, toPlainText, capText, DESCRIPTION_MAX };
