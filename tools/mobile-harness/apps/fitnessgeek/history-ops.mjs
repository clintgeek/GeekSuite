// The bounded history reads (SUITE_REVIEW_2026-11 FitnessGeek #1): Home asks
// `fitnessWeights(limit:)` / `bloodPressures(limit:)` as their own operations,
// GetFitnessWeightsBounded and GetBpsBounded. Every scene already stubs the
// bare GetFitnessWeights / GetBps with the rows it wants, so the bounded ops
// answer from those same rows — newest first, then the window and the limit,
// the way the gateway does — unless a scene stubs them itself.
const BOUNDED = {
  GetFitnessWeightsBounded: ['GetFitnessWeights', 'fitnessWeights'],
  GetBpsBounded: ['GetBps', 'bloodPressures'],
};

/** The bare op a bounded one answers from (for fail predicates and the like). */
export const bareOpOf = (op) => BOUNDED[op]?.[0] || op;

const day = (v) => (v ? String(v).slice(0, 10) : '');

/** An op resolver for graphqlRoute: `ops` plus the bounded aliases. */
export function withHistoryBounds(ops) {
  const lookup = typeof ops === 'function'
    ? ops
    : (name, vars, r) => {
      const entry = ops[name];
      return typeof entry === 'function' ? entry(vars, r) : entry;
    };
  return (name, vars = {}, r) => {
    const own = lookup(name, vars, r);
    const alias = BOUNDED[name];
    if (own !== undefined || !alias) return own;
    const base = lookup(alias[0], {}, r);
    if (base === undefined || base === null || base.__graphql) return base;
    const rows = Array.isArray(base[alias[1]]) ? [...base[alias[1]]] : [];
    rows.sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)));
    let out = rows.filter((row) => (!vars.startDate || day(row.log_date) >= day(vars.startDate))
      && (!vars.endDate || day(row.log_date) <= day(vars.endDate)));
    if (vars.limit) out = out.slice(0, vars.limit);
    return { ...base, [alias[1]]: out };
  };
}
