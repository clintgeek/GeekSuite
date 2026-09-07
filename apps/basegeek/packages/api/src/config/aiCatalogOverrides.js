/**
 * aiCatalogOverrides.js — the last hand-typed list about vendors.
 *
 * Everything else in the catalog is observed: the provider's own listing says
 * what exists, and `aiCatalogDiscovery`'s probe says whether it answers like a
 * general assistant. This file exists only for the families that *answer* and
 * are still never the right pick — a translator, a safety classifier, a
 * code-only build, an OCR or vision head. A probe cannot see that; a human can.
 *
 * **Keep this under 30 lines.** If it grows, the probe is wrong, not the list.
 * It replaced a 30-term `NOT_GENERAL` regex that quietly excluded live general
 * models (every `:free` slug, `compound`, `omni`, anything with a `b` in the
 * parameter count) and had to be read to know why a model never got picked.
 *
 * `allow` wins over `deny`: one genuine exception does not need a new rule.
 */
export const deny = [/lora/i, /translate/i, /safety|guard/i, /-code\b|coder/i, /ocr/i, /vision|-vl[-:]/i, /lyria|music/i];
export const allow = [];

/** `true` when this model id should never become a free-tier candidate. */
export function isDenied(modelId, overrides = { deny, allow }) {
  const id = String(modelId ?? '');
  if (!id) return true;
  if ((overrides.allow || []).some((re) => re.test(id))) return false;
  return (overrides.deny || []).some((re) => re.test(id));
}

export default { deny, allow, isDenied };
