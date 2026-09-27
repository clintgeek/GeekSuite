/**
 * The day's check-ins (DOCS/SIMPLE_AND_FULL_PLAN.md item 6): the Today strip
 * — "Weighed ✓ · BP — · Meds 2 of 3" — and the "Did you take your meds?"
 * checklist it counts.
 *
 * Pure, so the states can be pinned without a network.
 */
import { MED_TIME_OF_DAY_LABELS } from './medSlots.js';
import { rowDay } from './experience.js';

const onDay = (rows, day) => (Array.isArray(rows) ? rows : []).some((row) => rowDay(row) === day);

/**
 * One dose per (medication, time of day). A medication with no times set is
 * one daily dose — written under 'morning', the first slot, because a dose
 * log must name one — and shown with no time label.
 *
 * Status is the NEWEST log for that dose today: a tick writes `taken: true`,
 * an untick writes `taken: false`. The backend has no delete for a dose log,
 * and does not need one — the latest answer is the answer.
 *
 * @returns {{items: object[], taken: number, total: number}}
 */
export function medsChecklist(meds = [], logs = []) {
  const latest = new Map();
  const sorted = [...(Array.isArray(logs) ? logs : [])].sort((a, b) =>
    String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
  );
  for (const log of sorted) {
    const medId = String(log?.medication_id?._id || log?.medication_id?.id || log?.medication_id || '');
    if (!medId || !log?.time_of_day) continue;
    latest.set(`${medId}|${log.time_of_day}`, log.taken !== false);
  }

  const items = [];
  for (const med of Array.isArray(meds) ? meds : []) {
    const medId = String(med?.id || med?._id || '');
    if (!medId) continue;
    const slots = Array.isArray(med.times_of_day) && med.times_of_day.length ? med.times_of_day : [null];
    for (const slot of slots) {
      const stored = slot || 'morning';
      items.push({
        key: `${medId}|${stored}`,
        medId,
        name: med.display_name || med.brand_name || med.ingredient_name || 'Medication',
        slot: stored,
        slotLabel: slot ? MED_TIME_OF_DAY_LABELS[slot] || slot : null,
        taken: latest.get(`${medId}|${stored}`) === true,
      });
    }
  }
  return { items, taken: items.filter((i) => i.taken).length, total: items.length };
}

/**
 * The Today strip's three check-ins.
 *
 * @param {{weights?: object[], bloodPressures?: object[], meds?: {taken: number, total: number}|null, today: string}} input
 * @returns {{id: string, label: string, done: boolean, value: string, spoken: string, to: string}[]}
 */
export function todayStrip({ weights, bloodPressures, meds, today }) {
  const weighed = onDay(weights, today);
  const bp = onDay(bloodPressures, today);
  const items = [
    {
      id: 'weight',
      label: 'Weighed',
      done: weighed,
      value: weighed ? '✓' : '—',
      spoken: weighed ? 'Weighed today' : 'Not weighed yet today',
      to: '/weight',
    },
    {
      id: 'bp',
      label: 'BP',
      done: bp,
      value: bp ? '✓' : '—',
      spoken: bp ? 'Blood pressure taken today' : 'No blood pressure yet today',
      to: '/blood-pressure',
    },
  ];
  // No medications, no meds check-in: "Meds 0 of 0" is noise.
  if (meds && meds.total > 0) {
    const all = meds.taken >= meds.total;
    items.push({
      id: 'meds',
      label: 'Meds',
      done: all,
      value: all ? '✓' : `${meds.taken} of ${meds.total}`,
      spoken: all ? 'All medications taken today' : `${meds.taken} of ${meds.total} medications taken today`,
      to: '/medications',
    });
  }
  return items;
}
