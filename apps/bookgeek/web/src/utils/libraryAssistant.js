/**
 * The library assistant's pure helpers (AI idea #4, stream R117).
 *
 * They live outside the components that use them for two reasons: a component
 * file that also exports a plain function loses Fast Refresh
 * (`react-refresh/only-export-components`), and the provenance wording is one
 * decision shared by two surfaces — the What-next shelf header and the edit
 * dialog's draft button — which is exactly the kind of thing that drifts when
 * it is written twice.
 */

/**
 * The one line that says where a result came from.
 *
 * A fallback is not a failure: it is the deterministic answer the gateway
 * computes when the model is off, capped or unreachable, and it says so rather
 * than borrowing the model's credit. `null` means "nothing has been drafted
 * yet", so the caller renders no line at all.
 *
 * @param {{source?: string, reason?: string, model?: string}|null} provenance
 * @param {{fallbackText: string, capText?: string}} copy  what the fallback did
 */
export function provenanceLine(provenance, copy) {
  if (!provenance) return null;
  if (provenance.source === "model") {
    return `Drafted by ${ provenance.model || "the suite's model" }`;
  }
  if (provenance.reason === "cap" && copy?.capText) return copy.capText;
  return copy?.fallbackText || "No model — deterministic result";
}

/** The What-next shelf header. */
export function whatNextProvenanceLine(provenance) {
  return provenanceLine(provenance, {
    fallbackText: "No model — ranked from your own ratings",
    capText: "Daily AI limit reached — ranked from your own ratings",
  });
}

/** The edit dialog, which additionally has to say "review before saving". */
export function metadataDraftProvenanceLine(provenance) {
  if (!provenance) return null;
  if (provenance.source === "model") {
    return `AI-drafted by ${ provenance.model || "the suite's model" } — review before saving`;
  }
  if (provenance.reason === "cap") {
    return "Daily AI limit reached — tags from this author's other books, no description";
  }
  return "No model — tags from this author's other books, no description";
}

/**
 * Merge a drafted tag list into whatever the Tags field already holds, without
 * losing or duplicating one. The field is the comma-separated string the form
 * edits, so this speaks that language in and out.
 */
export function mergeTagList(currentCsv, draftedTags) {
  const existing = String(currentCsv || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set(existing.map((t) => t.toLowerCase()));
  for (const tag of Array.isArray(draftedTags) ? draftedTags : []) {
    const clean = typeof tag === "string" ? tag.trim() : "";
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    existing.push(clean);
  }
  return existing.join(", ");
}
