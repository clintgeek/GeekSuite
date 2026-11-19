/**
 * The play assistant's provenance line (DOCS/WHAT_NEXT_SPEC.md).
 *
 * Same rule as BookGeek's libraryAssistant util: a fallback is not a
 * failure — it is the deterministic answer the gateway computed because the
 * model was off, capped or unreachable — and the strip says so rather than
 * borrowing the model's credit. `null` means nothing has answered yet, so
 * the caller renders no line at all.
 *
 * Plain words (review 2026-11-18 #10): Heather reads this sheet too, and a
 * model id ("llama-3.1-8b-instant") reads as an error code. The line says who
 * picked — the play assistant, or your own library — and nothing about models.
 */

/**
 * @param {{source?: string, reason?: string, model?: string}|null} provenance
 * @returns {string|null} who picked, or nothing
 */
export function whatNextProvenanceLine(provenance) {
  if (!provenance) return null;
  if (provenance.source === "model") {
    return "Picked by the play assistant";
  }
  if (provenance.reason === "cap") {
    return "The play assistant is done for today — ranked from your own library";
  }
  return "Ranked from your own library";
}
