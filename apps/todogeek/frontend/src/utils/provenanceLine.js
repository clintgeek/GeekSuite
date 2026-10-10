/**
 * provenanceLine — the sentence under an AI-assisted card that says where the
 * words came from.
 *
 * Required by DOCS/AI_IDEAS.md's shared rules: every draft carries a visible
 * provenance line, "drafted by <model>" or "no model — deterministic summary".
 * It lives in its own module rather than beside the card because a second
 * feature will want the same sentence, and because a component file that also
 * exports a helper loses fast refresh.
 *
 * The shape it reads is the gateway's `AIProvenance`
 * (`services/aiFeatureRunner.js`): `{ source, reason, model, provider, cached,
 * callsToday, cap }`.
 */
export function provenanceLine(provenance) {
  if (!provenance) return '';
  if (provenance.source === 'model') {
    const who = provenance.model || 'an unnamed model';
    const via = provenance.provider ? ` via ${provenance.provider}` : '';
    const cached = provenance.cached ? ', cached' : '';
    const budget = provenance.cap
      ? ` \u00b7 ${provenance.callsToday} of ${provenance.cap} drafts today`
      : '';
    return `Drafted by ${who}${via}${cached}${budget}`;
  }
  switch (provenance.reason) {
    case 'opted_out':
      return 'No model \u2014 deterministic summary. Turn on \u201cAI review draft\u201d in Settings to have one written.';
    case 'cap':
      return 'No model \u2014 deterministic summary. You have used today\u2019s drafts.';
    default:
      return 'No model \u2014 deterministic summary. The model did not answer in time.';
  }
}

export default provenanceLine;
