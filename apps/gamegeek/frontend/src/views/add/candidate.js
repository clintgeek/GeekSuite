/**
 * Metadata candidate (GET /api/metadata/search) → the add form's initial
 * values. Pure, so the Steam-copy default and the vocabulary filtering are
 * testable without a network.
 */
import { calendarDateToUtcIso, todayInputValue, utcIsoToInputValue } from '../../utils/dates';
import { defaultStorefrontFor } from '../../utils/vocab';

export function sourceFor(candidate) {
  const p = String(candidate?.provider || '').toLowerCase();
  if (p.includes('steam')) return 'steam-store';
  if (p.includes('igdb')) return 'igdb';
  return 'manual';
}

export function isSteamCandidate(candidate) {
  return sourceFor(candidate) === 'steam-store' || Boolean(candidate?.externalIds?.steamAppId && !candidate?.externalIds?.igdb);
}

function defaultCopy(candidate, platforms, profile) {
  if (isSteamCandidate(candidate)) return { platform: 'pc', format: 'digital', storefront: 'steam' };
  const owned = profile?.platformsOwned || [];
  const pick =
    (profile?.defaultPlatform && platforms.includes(profile.defaultPlatform) && profile.defaultPlatform) ||
    platforms.find((p) => owned.includes(p)) ||
    platforms[0] ||
    profile?.defaultPlatform ||
    '';
  if (!pick) return null;
  return { platform: pick, format: 'digital', storefront: defaultStorefrontFor(pick) };
}

export function candidateToForm(candidate, { vocab, profile } = {}) {
  const allowedPlatforms = vocab?.platforms || [];
  const allowedModes = vocab?.modes || [];
  const platforms = (candidate?.platforms || []).filter((p) => !allowedPlatforms.length || allowedPlatforms.includes(p));
  const copy = defaultCopy(candidate, platforms, profile);
  const ext = candidate?.externalIds || {};
  return {
    title: candidate?.title || '',
    releaseDate: utcIsoToInputValue(candidate?.releaseDate),
    developers: (candidate?.developers || []).join(', '),
    publishers: (candidate?.publishers || []).join(', '),
    genres: (candidate?.genres || []).join(', '),
    description: candidate?.description || '',
    modes: (candidate?.modes || []).filter((m) => !allowedModes.length || allowedModes.includes(m)),
    platformsAvailable: platforms,
    copies: copy ? [copy] : [],
    shelf: 'backlog',
    coverUrl: candidate?.coverUrl || null,
    source: sourceFor(candidate),
    externalIds: {
      ...(ext.igdb ? { igdb: String(ext.igdb) } : {}),
      ...(ext.steamAppId ? { steamAppId: String(ext.steamAppId) } : {}),
    },
  };
}

export function emptyForm({ profile, title = '' } = {}) {
  const platform = profile?.defaultPlatform || '';
  return {
    title,
    releaseDate: '',
    developers: '',
    publishers: '',
    genres: '',
    description: '',
    modes: [],
    platformsAvailable: platform ? [platform] : [],
    copies: platform ? [{ platform, format: 'digital', storefront: defaultStorefrontFor(platform) }] : [],
    shelf: 'backlog',
    coverUrl: null,
    source: 'manual',
    externalIds: {},
  };
}

const list = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 50);

export function formToCreateInput(form) {
  const input = {
    title: form.title.trim(),
    developers: list(form.developers),
    publishers: list(form.publishers),
    genres: list(form.genres),
    modes: form.modes,
    platformsAvailable: [...new Set([...form.platformsAvailable, ...form.copies.map((c) => c.platform).filter(Boolean)])],
    copies: form.copies
      .filter((c) => c.platform)
      .map((c) => ({ platform: c.platform, ...(c.format ? { format: c.format } : {}), ...(c.storefront ? { storefront: c.storefront } : {}) })),
    source: form.source || 'manual',
  };
  const date = calendarDateToUtcIso(form.releaseDate);
  if (date) input.releaseDate = date;
  if (form.description.trim()) input.description = form.description.trim().slice(0, 5000);
  if (Object.keys(form.externalIds || {}).length) input.externalIds = form.externalIds;
  return input;
}

export { todayInputValue };
