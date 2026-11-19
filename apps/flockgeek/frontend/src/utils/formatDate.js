/**
 * One short date format for the whole app (UX review 2026-11-18, FlockGeek
 * 10): "18 Nov" this year, "18 Nov 2026" any other year. The lists used to
 * print "6/1/2024" and "11/18/2026" beside Home's "Nov 18".
 *
 * `formatDay` is for calendar dates (a harvest date, a hatch date, a birth
 * date), which the gateway stores at UTC midnight: they are read as UTC so the
 * day never slips. `formatInstantDay` is for real instants (`createdAt`),
 * read in the viewer's own timezone.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Built by hand rather than with `toLocaleDateString('en-GB', …)`: ICU
// versions disagree on the short month ("Sep" or "Sept"), and one format
// means one format on every phone.
function format(day, month, year, now) {
  return `${day} ${MONTHS[month]}${year !== now.getFullYear() ? ` ${year}` : ''}`;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A stored calendar day as "18 Nov" (this year) or "18 Nov 2026"; `''` if missing. */
export function formatDay(value, now = new Date()) {
  const d = toDate(value);
  return d ? format(d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear(), now) : '';
}

/** A real instant's local day, in the same format. */
export function formatInstantDay(value, now = new Date()) {
  const d = toDate(value);
  return d ? format(d.getDate(), d.getMonth(), d.getFullYear(), now) : '';
}
