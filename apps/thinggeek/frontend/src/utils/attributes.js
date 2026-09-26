/**
 * Type attributes: how a stored value reads by its field kind, and how a
 * form's text becomes the value the gateway validates.
 *
 * Wire shapes (what `attributes` carries per kind — the gateway must agree):
 *   text / choice / url → string
 *   number              → number
 *   money               → { amount, currency: 'USD' }
 *   date                → ISO string at UTC midnight (a calendar day)
 *   boolean             → true / false
 * On update the gateway MERGES attributes: only changed keys are sent, and
 * `null` clears one (`buildAttributePatch`). On create, blanks are omitted.
 */
import { calendarDateToUtcIso, formatCalendarDate, utcIsoToInputValue } from './dates';
import { formatMoney, moneyAmount, parseMoneyInput } from './money';
import { hasValue } from './identifiers';

export function formatAttribute(field, value) {
  if (!hasValue(value)) return '';
  switch (field.kind) {
    case 'number': {
      const n = Number(value);
      // A year is a label, not a quantity: 2019, never "2,019".
      const isYear = /year/i.test(`${field.key} ${field.label}`);
      const text = Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: !isYear }) : String(value);
      return field.unit ? `${text} ${field.unit}` : text;
    }
    case 'money':
      return formatMoney(moneyAmount(value));
    case 'date':
      return formatCalendarDate(value);
    case 'boolean':
      return value === true || value === 'true' ? 'Yes' : 'No';
    case 'url':
      return String(value);
    default:
      return field.unit ? `${value} ${field.unit}` : String(value);
  }
}

/** A stored value → the text/boolean a form control holds. */
export function attributeToForm(field, value) {
  if (field.kind === 'boolean') return value === true || value === 'true';
  if (!hasValue(value)) return '';
  if (field.kind === 'date') return utcIsoToInputValue(value);
  if (field.kind === 'money') return String(moneyAmount(value) ?? '');
  return String(value);
}

/** A form control's value → the wire value, or `undefined` for "not set". */
export function formToAttribute(field, raw) {
  switch (field.kind) {
    case 'boolean':
      return raw === true ? true : raw === false ? false : undefined;
    case 'number': {
      const s = String(raw ?? '').replace(/,/g, '').trim();
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'money': {
      const n = parseMoneyInput(raw);
      return n === null ? undefined : { amount: n, currency: 'USD' };
    }
    case 'date':
      return calendarDateToUtcIso(raw) ?? undefined;
    default: {
      const s = String(raw ?? '').trim();
      return s ? s : undefined;
    }
  }
}

/** A form's attribute texts → the `attributes` map for the chosen type's fields only. */
export function buildAttributes(fields = [], formValues = {}) {
  const out = {};
  for (const f of fields) {
    const v = formToAttribute(f, formValues[f.key]);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The update patch: for each of the (new) type's fields, the new wire value
 * when it differs from what was stored, `null` when it was cleared. Keys
 * that didn't change are left out — the gateway merges.
 */
export function buildAttributePatch(fields = [], formValues = {}, original = {}) {
  const out = {};
  for (const f of fields) {
    const next = formToAttribute(f, formValues[f.key]);
    const before = original?.[f.key];
    const had = hasValue(before) || before === false;
    if (next === undefined) {
      if (had) out[f.key] = null;
    } else if (!had || !same(next, f.kind === 'date' ? calendarDateToUtcIso(utcIsoToInputValue(before)) : f.kind === 'money' ? { amount: moneyAmount(before), currency: before?.currency || 'USD' } : before)) {
      out[f.key] = next;
    }
  }
  return out;
}

/** Whether a url attribute is safe to render as a link. */
export function safeHref(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Make/model (or brand/model / manufacturer/model) from a thing's rendered fields. */
export function makeModel(fields = []) {
  const get = (...keys) => fields.find((f) => keys.includes(f.key) && hasValue(f.value))?.value;
  const make = get('make', 'manufacturer', 'brand');
  const model = get('model');
  return [make, model].filter(Boolean).join(' ');
}
