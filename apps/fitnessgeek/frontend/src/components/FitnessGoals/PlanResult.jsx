import React, { useState } from 'react';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { Tag } from '../primitives';
import { MetabolismCard, ProteinBasisNote } from './planProvenance.jsx';
import { weekenderHasRoom } from './planMath.js';
import { fmt, macroLine } from '../../utils/plainWords.js';

/**
 * How a calorie plan is read back to the person: one sentence with the
 * number, one about what it does, and everything else behind a tap. Used for
 * the plan about to be saved and for the plan already saved, so the two can
 * never describe the same plan differently.
 */

/** 0.5 → "½", 1.5 → "1½", 1.7 → "1.7". */
export const lbWords = (rate) => {
  const r = Math.round(Number(rate) * 10) / 10;
  if (r === 0.5) return '½';
  if (Number.isInteger(r)) return String(r);
  if (r % 1 === 0.5) return `${Math.floor(r)}½`;
  return String(r);
};

const round1 = (n) => Math.round(Number(n) * 10) / 10;

/** A 'YYYY-MM-DD' as a LOCAL day (`new Date('YYYY-MM-DD')` is UTC midnight). */
export function localDay(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const dayWords = (date, now) => date.toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
});

/** What the plan does, in a sentence or two. `endDate` is optional. */
export function outcomeWords(plan, { endDate = null, now = new Date() } = {}) {
  if (!plan) return '';
  if (!(Number(plan.weightChangeRate) > 0)) return 'That should keep your weight about where it is.';
  const lose = `That should lose about ${lbWords(plan.weightChangeRate)} lb a week.`;
  const target = Number(plan.targetWeight);
  if (!(target > 0)) return lose;
  const end = localDay(endDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (end && end >= startOfToday) return `${lose} You’d reach ${round1(target)} lb around ${dayWords(end, now)}.`;
  if (plan.timeline > 0) {
    return `${lose} About ${plan.timeline === 1 ? '1 week' : `${plan.timeline} weeks`} to reach ${round1(target)} lb.`;
  }
  return lose;
}

const isUniform = (schedule) => !Array.isArray(schedule) || schedule.length !== 7
  || schedule.every((d) => d.calories === schedule[0].calories);

/** A row that opens a section. The whole row is the 48px target. */
export function Disclosure({ label, children, defaultOpen = false, testId }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ borderTop: (t) => `1px solid ${t.palette.divider}` }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={testId}
        sx={{
          width: '100%',
          minHeight: 48,
          justifyContent: 'space-between',
          textAlign: 'left',
          gap: 2,
          fontFamily: 'inherit',
          fontSize: '1rem',
          fontWeight: 600,
          color: 'primary.main',
          '&:focus-visible': { outline: (t) => `3px solid ${t.palette.primary.main}`, outlineOffset: -3 },
        }}
      >
        {label}
        <ExpandIcon aria-hidden sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 1, pb: 4 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

/** The seven days, shown only when they are not all the same number. */
function Week({ schedule }) {
  return (
    <Box data-testid="plan-week">
      <Typography sx={{ fontWeight: 600, fontSize: '1rem', mb: 2 }}>Your week</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(7, minmax(0, 1fr))' }, columnGap: 2, rowGap: 3 }}>
        {schedule.map((d) => (
          <Box key={d.day} sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{d.day}</Typography>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calories)}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * The top of the card: the target, what it does, and the few things worth
 * saying without being asked (a target held up by the safety floor, a
 * weekend boost with no room, the week when its days differ).
 *
 * @param {Object} plan      buildCaloriePlan's result, or the saved plan in the same shape
 * @param {string} mode      'standard' | 'keto'
 * @param {Object} keto      the keto settings, when mode is 'keto'
 * @param {Object} macros    previewMacros' result for a standard plan, or null
 * @param {string|Date} endDate when the plan reaches its goal weight, if known
 */
export function PlanHeadline({ plan, mode = 'standard', keto = null, macros = null, endDate = null, headingRef }) {
  if (!plan) return null;
  const weekender = plan.planType === 'weekender';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography
          component="h2"
          ref={headingRef}
          tabIndex={-1}
          data-testid="plan-headline"
          sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', outline: 'none' }}
        >
          {`Your daily target is ${fmt(plan.dailyCalories)} calories`}
        </Typography>
        <Typography data-testid="plan-outcome" sx={{ fontSize: '1.0625rem', color: 'text.secondary', mt: 1 }}>
          {outcomeWords(plan, { endDate })}
        </Typography>
      </Box>

      {plan.floored && (
        <Typography variant="body2" data-testid="plan-floor-note" sx={{ color: 'text.secondary' }}>
          {`Your target is at the safety floor (${fmt(plan.rules?.minSafeCalories)} cal, 80% of your calories at rest), so this plan loses about ${plan.weightChangeRate} lb a week, not ${plan.requestedRate}. The timeline uses ${plan.weightChangeRate}.`}
        </Typography>
      )}

      {mode === 'keto' && keto && (
        <Typography data-testid="plan-keto-line" sx={{ color: 'text.primary' }}>
          {`Keto: ${keto.net_carb_limit_g}g ${keto.track_net_carbs === false ? 'carbs' : 'net carbs'} a day at most. `}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {keto.macro_split?.preset === 'lazy'
              ? 'Watching the carb cap only.'
              : `${keto.macro_split?.fat_pct ?? 70}% fat, ${keto.macro_split?.protein_pct ?? 25}% protein, ${keto.macro_split?.carb_pct ?? 5}% carbs.`}
          </Box>
        </Typography>
      )}

      {macros && (
        <Box data-testid="macro-preview">
          <Typography sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {macroLine({ protein: macros.grams.protein_g, carbs: macros.grams.carbs_g, fat: macros.grams.fat_g })}
          </Typography>
        </Box>
      )}

      {!isUniform(plan.schedule) && <Week schedule={plan.schedule} />}
      {weekender && !weekenderHasRoom(plan.schedule) && (
        <Typography variant="body2" data-testid="plan-weekender-note" sx={{ color: 'text.secondary' }}>
          {plan.weekenderSuggestion
            ? `No room for a weekend boost at this rate: every day is already at the floor. At ${plan.weekenderSuggestion.rate} lb a week you’d eat ${fmt(plan.weekenderSuggestion.weekday)} on other days and ${fmt(plan.weekenderSuggestion.weekend)} on Fri and Sat.`
            : 'No room for a weekend boost: every day is already at the safety floor, even at the slowest rate.'}
        </Typography>
      )}
      {plan.rules?.autoAdjust && (
        <Typography variant="body2" data-testid="plan-auto-note" sx={{ color: 'text.secondary' }}>
          {`If you go over on a day, the rest of the week adjusts to make up for it, never below ${fmt(plan.rules.minSafeCalories)} calories.`}
        </Typography>
      )}
    </Box>
  );
}

/** "How this was worked out": the numbers behind the target. */
export function PlanWorking({ plan, scanLoadFailed = false, proteinRules = null, note = null }) {
  if (!plan) return null;
  const valid = Boolean(plan.rules?.calculationValid);
  const safe = plan.dailyCalories >= 1200;
  const losing = Number(plan.weightChangeRate) > 0;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 6, rowGap: 4 }}>
      <MetabolismCard plan={plan} scanLoadFailed={scanLoadFailed} />
      <Box>
        <Box sx={{ borderTop: (t) => `1px solid ${t.palette.divider}`, mt: 0.5 }} aria-hidden />
        <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1.0625rem', py: 0.75 }}>
          What you eat
        </Typography>
        {losing && (
          <Box sx={{ pb: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Under what you burn, each day</Typography>
            {/* The plan, not a problem: neutral ink (D-12). */}
            <Typography sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
              {`${fmt(plan.weeklyDeficit)} cal a day`}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {`${fmt(plan.weeklyDeficit * 7)} cal a week is about ${lbWords(plan.weightChangeRate)} lb a week`}
            </Typography>
          </Box>
        )}
        <Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>Safety check</Typography>
          {/* `calculationValid` (a real calories-at-rest figure) gates this
              before the calorie floor does: a plan built on a figure that
              never computed must never be able to say "Safe". */}
          <Tag tone={!valid ? 'error' : safe ? 'success' : 'warning'} sx={{ fontSize: '0.875rem' }}>
            {!valid ? 'Calculation error' : safe ? 'Safe' : 'Below minimum'}
          </Tag>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            {!valid
              ? 'Your height couldn’t be read, so this plan isn’t reliable'
              : 'Never below 1,200 calories a day'}
          </Typography>
        </Box>
        {/* The arithmetic lives here, in words, and nowhere above the fold. */}
        <ProteinBasisNote rules={proteinRules} sx={{ mt: 3 }} />
      </Box>
      {note && (
        <Typography variant="body2" data-testid="plan-working-note" sx={{ color: 'text.secondary', gridColumn: '1 / -1' }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}
