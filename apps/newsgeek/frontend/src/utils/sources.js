import { worstHealth } from './health';

/** "23 active · 2 failing · 1 broken" — the Sources page's one-line summary. */
export function sourceSummary(sources = []) {
  const active = sources.filter((s) => s.status === 'active').length;
  const live = sources.filter((s) => s.status !== 'retired');
  const failing = live.filter((s) => s.status !== 'broken' && worstHealth(s.feeds) === 'failing').length;
  const broken = live.filter((s) => s.status === 'broken' || worstHealth(s.feeds) === 'broken').length;
  const parts = [`${active} active`];
  if (failing) parts.push(`${failing} failing`);
  if (broken) parts.push(`${broken} broken`);
  return parts.join(' · ');
}

/** The host of a feed or homepage URL, for a compact line. */
export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

/** A source as the form edits it. */
export function formFromSource(source) {
  return {
    name: source?.name ?? '',
    homepage: source?.homepage ?? '',
    kind: source?.kind ?? 'journalism',
    sections: source?.sections ?? [],
    placeIds: (source?.places ?? []).map((p) => p.id),
    feeds: source?.feeds?.length
      ? source.feeds.map((f) => ({ url: f.url, format: f.format, pollEveryMin: f.pollEveryMin }))
      : [{ url: '', format: 'rss', pollEveryMin: 30 }],
    paywall: source?.access?.paywall ?? 'none',
    content: source?.access?.content ?? 'excerpt',
    blockedDomains: (source?.blockedDomains ?? []).join('\n'),
    notes: source?.notes ?? '',
  };
}

/** The form as a NewsSourceInput (contract field names). */
export function inputFromForm(form) {
  return {
    name: form.name.trim(),
    homepage: form.homepage.trim() || null,
    kind: form.kind,
    sections: form.sections,
    placeIds: form.placeIds,
    feeds: form.feeds
      .filter((f) => f.url.trim())
      .map((f) => ({ url: f.url.trim(), format: f.format, pollEveryMin: Number(f.pollEveryMin) || 30 })),
    paywall: form.paywall,
    content: form.content,
    blockedDomains: form.blockedDomains
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    notes: form.notes.trim(),
  };
}

export function formErrors(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'A source needs a name.';
  const feeds = form.feeds.filter((f) => f.url.trim());
  if (!feeds.length) errors.feeds = 'Add at least one feed URL.';
  feeds.forEach((f) => {
    if (!/^https?:\/\//i.test(f.url.trim())) errors.feeds = 'Feed URLs start with http:// or https://.';
  });
  if (form.homepage.trim() && !/^https?:\/\//i.test(form.homepage.trim())) errors.homepage = 'Start with http:// or https://.';
  return errors;
}

/** The Sources filter: all, needs attention (stale/failing/broken), or one status. */
export function matchesFilter(source, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return source.status === 'broken' || ['failing', 'broken', 'stale'].includes(worstHealth(source.feeds));
  return source.status === filter;
}
