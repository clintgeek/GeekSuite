/**
 * The play assistant's provenance line (DOCS/WHAT_NEXT_SPEC.md).
 *
 * Same rule as BookGeek's libraryAssistant util: a fallback is not a
 * failure — it is the deterministic answer the gateway computed because the
 * model was off, capped or unreachable — and the strip says so rather than
 * borrowing the model's credit. `null` means nothing has answered yet, so
 * the caller renders no line at all.
 */

/**
 * @param {{source?: string, reason?: string, model?: string}|null} provenance
 * @returns {string|null} the "AI-picked"/fallback label, or nothing
 */
export function whatNextProvenanceLine(provenance) {
  if (!provenance) return null;
  if (provenance.source === "model") {
    return `AI-picked by ${provenance.model || "the suite's model"}`;
  }
  if (provenance.reason === "cap") {
    return "Daily AI limit reached — ranked from your own library";
  }
  return "No model — ranked from your own library";
}
