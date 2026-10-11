/**
 * "Open with…" links: a reader's own URL templates (NewsPrefs.readerLinks,
 * max 5). `{url}` (required) becomes the story's link and `{title}` its
 * headline. Each placeholder's VALUE is percent-encoded on its own
 * (encodeURIComponent); the template's own `/ ? & =` are never touched.
 * Validation mirrors the gateway's (it answers BAD_USER_INPUT otherwise).
 */
export const MAX_READER_LINKS = 5;
export const MAX_LABEL = 40;
export const READER_LINK_HELP = '{url} becomes the story’s link; {title} its headline';
export const READER_LINK_PLACEHOLDER = 'https://example.com/read?u={url}';

const PLACEHOLDER = /\{([^{}]*)\}/g;

const isWebUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/** The finished URL, or null when the result isn't an http(s) URL. */
export function buildReaderUrl(template, { url = '', title = '' } = {}) {
  if (typeof template !== 'string' || !template) return null;
  const built = template.replace(PLACEHOLDER, (whole, name) => {
    if (name === 'url') return encodeURIComponent(url ?? '');
    if (name === 'title') return encodeURIComponent(title ?? '');
    return whole;
  });
  return isWebUrl(built) ? built : null;
}

/** { label?, template? } error lines for one link; {} when it's fine. */
export function readerLinkErrors({ label = '', template = '' } = {}) {
  const errors = {};
  const l = label.trim();
  const t = template.trim();
  if (!l) errors.label = 'Give it a name.';
  else if (l.length > MAX_LABEL) errors.label = `${MAX_LABEL} characters at most.`;
  if (!t) errors.template = 'Add the link.';
  else {
    const names = [...t.matchAll(PLACEHOLDER)].map((m) => m[1]);
    const unknown = names.filter((n) => n !== 'url' && n !== 'title');
    if (!/^https?:\/\//i.test(t) || !isWebUrl(t.replace(PLACEHOLDER, 'x'))) errors.template = 'Start with http:// or https://.';
    else if (!names.includes('url')) errors.template = 'Put {url} where the story’s link goes.';
    else if (unknown.length) errors.template = `Only {url} and {title} — not {${unknown[0]}}.`;
  }
  return errors;
}

export const cleanReaderLinks = (links = []) => links.map((l) => ({ label: l.label.trim(), template: l.template.trim() }));
