/**
 * The one-line "where did this come from" caption every AI-assisted surface in
 * the suite carries next to its `AI-drafted` chip (DOCS/AI_IDEAS.md, shared
 * rules). It lives in its own module rather than beside the component so the
 * component file exports only a component — a file that exports both loses
 * fast refresh, which eslint's `react-refresh/only-export-components` says out
 * loud.
 */
/**
 * It says which of the two halves answered, in words rather than a status
 * code, because "no model" is a normal outcome here and not an error.
 */
export function provenanceLine(provenance) {
  if (!provenance || provenance.source !== 'model') {
    const reason = provenance?.reason;
    if (reason === 'cap') {
      const cap = provenance?.cap;
      return cap
        ? `no model — that is today's ${cap} drafts used; split from your own words`
        : 'no model — the daily draft limit is used up; split from your own words';
    }
    if (reason === 'disabled') {
      return 'no model — AI is switched off for this account; split from your own words';
    }
    if (reason === 'unavailable') {
      return 'no model — the model did not answer in time; split from your own words';
    }
    return 'no model — split from your own words';
  }
  const bits = [`drafted by ${provenance.model || 'the routed model'}`];
  if (provenance.provider) bits.push(provenance.provider);
  if (provenance.cached) bits.push('cached');
  if (provenance.cap) bits.push(`${provenance.callsToday} of ${provenance.cap} today`);
  return bits.join(' · ');
}

export default { provenanceLine };
