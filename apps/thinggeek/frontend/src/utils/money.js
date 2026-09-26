/**
 * Money. Amounts are plain numbers in the stated currency (USD unless the
 * record says otherwise); a missing amount is `null`, never 0 — "no value
 * recorded" and "worth nothing" are different answers on a claim.
 */

const formatters = new Map();

function formatter(currency, fraction) {
  const key = `${currency}|${fraction}`;
  if (!formatters.has(key)) {
    let f;
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: fraction ? 2 : 0,
        maximumFractionDigits: fraction ? 2 : 0,
      });
    } catch {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    formatters.set(key, f);
  }
  return formatters.get(key);
}

/** "$1,250" (whole) or "$1,249.99" (cents shown only when there are any). */
export function formatMoney(amount, currency = 'USD') {
  const n = moneyAmount(amount);
  if (n === null) return '';
  return formatter(currency, !Number.isInteger(n)).format(n);
}

/** A money-ish value → number or null. Accepts a number, a numeric string or `{ amount }`. */
export function moneyAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'object' ? value.amount : value;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A form's money text ("1,250.50", "$900") → number or null. Negative is not money here. */
export function parseMoneyInput(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
