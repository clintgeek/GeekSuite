/**
 * `/attention` — what needs doing, as the rental counter's dashboard
 * (Storage Yard):
 *
 *   the dash      two warning lights — Overdue (red) and Due soon (amber),
 *                 lit with their counts — and the RECORD CHECK gauge: how
 *                 complete the records are.
 *   Getting       the first-run checklist (components/OnboardingChecklist),
 *   started       while the household is getting going.
 *   the lists     the things overdue, then due in the server's 30-day window.
 *   Record check  each insurance gap as a line with its count, a door into
 *                 the library pre-filtered to exactly those things
 *                 (`/?missing=receipt`).
 *
 * The gauge reads from what this page already fetches, no new query:
 * thingAttention's missing-photo, -receipt and -value counts over three
 * checks per inventory thing (the containment tree's non-location count).
 * The ID-plate and serial counts are left out of the percentage — they only
 * apply to types with an identifier field, and this page doesn't know how
 * many of those there are — but they're on the checklist below.
 */
import React, { useMemo } from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { ChevronRight as GoIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { GeekErrorState } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import SectionHeading from '../components/SectionHeading';
import OnboardingChecklist, { CheckSquare, DoneStamp } from '../components/OnboardingChecklist';
import ThingPhoto from '../components/ThingPhoto';
import { statusTone } from '../components/DueLine';
import { coverSrc, thingWhereText } from '../components/thingDisplay';
import { thingPath } from '../components/navConfig';
import { useAttention, useThingTree } from '../hooks/useThingMeta';
import { CHROME, DISPLAY_FONT, LIVERY, MARKER, STENCIL_FONT, dustImage } from '../theme/theme';
import { dueDateOf, formatCalendarDate, relativeDay } from '../utils/dates';
import { libraryLinkWith } from '../utils/libraryFilter';
import { dateKindLabel } from '../utils/vocab';
import { isLocation, isParentKind, kindOf } from '../utils/where';

export const GAP_CARDS = [
  { key: 'id-plate', field: 'missingIdPlate', title: 'No ID-plate photo', text: 'The plate carries the model and serial — the photo an adjuster asks for first.' },
  { key: 'receipt', field: 'missingReceipt', title: 'No receipt', text: 'Proof of purchase and price, as a photo or a PDF.' },
  { key: 'serial', field: 'missingSerial', title: 'Serial missing', text: 'A type with a serial field, and the field is empty.' },
  { key: 'value', field: 'missingValue', title: 'No value', text: "The insurance report can't total what isn't there." },
  { key: 'photo', field: 'missingPhoto', title: 'No photo', text: 'Not even one. Start with the overview.' },
];

/** The record-check percentage: photo, receipt and value on file, over three checks per inventory thing. Null with nothing recorded. */
export function recordCheckPercent(attention, items) {
  if (!attention || !items) return null;
  const missing = (attention.missingPhoto ?? 0) + (attention.missingReceipt ?? 0) + (attention.missingValue ?? 0);
  const checks = items * 3;
  return Math.max(0, Math.min(100, Math.round((100 * (checks - missing)) / checks)));
}

// ── The dash ─────────────────────────────────────────────────────────────────

function WarningLight({ tone, count, label, testId }) {
  const lit = count > 0;
  const fill = tone === 'soon' ? MARKER.soon : MARKER.overdue;
  return (
    <Box data-testid={testId} data-lit={lit ? 'true' : 'false'} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 38,
          height: 38,
          flexShrink: 0,
          borderRadius: '50%',
          border: `3px solid #000`,
          bgcolor: lit ? fill : '#2B2621',
          backgroundImage: lit ? 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 45%)' : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.10), transparent 45%)',
          boxShadow: lit ? `0 0 14px 3px ${fill}` : 'inset 0 2px 4px rgba(0,0,0,0.6)',
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1, color: CHROME.text, fontVariantNumeric: 'tabular-nums' }}>
          {count ?? '–'}
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: CHROME.secondary }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

/** The fuel-gauge-style needle: E at the left, F at the right. Decorative; the words under it say the number. */
function Gauge({ percent }) {
  const p = percent ?? 0;
  const angle = -90 + (180 * p) / 100;
  const r = 52;
  const arc = (from, to) => {
    const a0 = ((from - 180) * Math.PI) / 180;
    const a1 = ((to - 180) * Math.PI) / 180;
    const x0 = 70 + r * Math.cos(a0);
    const y0 = 66 + r * Math.sin(a0);
    const x1 = 70 + r * Math.cos(a1);
    const y1 = 66 + r * Math.sin(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  return (
    <svg viewBox="0 0 140 78" width="100%" aria-hidden="true" focusable="false" data-testid="record-gauge" data-percent={percent ?? ''}>
      <path d={arc(0, 180)} stroke="#3A332C" strokeWidth="10" fill="none" />
      {percent != null && p > 0 ? <path d={arc(0, (180 * p) / 100)} stroke={LIVERY.orange} strokeWidth="10" fill="none" /> : null}
      <path d={arc(0, 36)} stroke={MARKER.overdue} strokeWidth="3" fill="none" transform="translate(0 0)" opacity="0.9" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = ((i * 22.5 - 180) * Math.PI) / 180;
        const x0 = 70 + 40 * Math.cos(a);
        const y0 = 66 + 40 * Math.sin(a);
        const x1 = 70 + (i % 2 ? 44 : 46) * Math.cos(a);
        const y1 = 66 + (i % 2 ? 44 : 46) * Math.sin(a);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={CHROME.secondary} strokeWidth={i % 2 ? 1 : 2} />;
      })}
      <text x="18" y="76" fill={CHROME.secondary} fontFamily={STENCIL_FONT} fontSize="10">E</text>
      <text x="116" y="76" fill={CHROME.secondary} fontFamily={STENCIL_FONT} fontSize="10">F</text>
      <g transform={`rotate(${angle} 70 66)`} style={{ transition: 'transform 600ms ease' }}>
        <path d="M68 66 L70 22 L72 66 Z" fill={LIVERY.orange} stroke="#000" strokeWidth="0.6" />
      </g>
      <circle cx="70" cy="66" r="6" fill="#0B0A09" stroke={CHROME.secondary} strokeWidth="1.5" />
    </svg>
  );
}

function Dashboard({ overdue, dueSoon, percent, items }) {
  return (
    <Box
      component="section"
      aria-label="Dashboard"
      data-testid="dashboard"
      sx={{
        position: 'relative',
        mb: 2.5,
        borderRadius: '10px',
        bgcolor: CHROME.bar,
        backgroundImage: `${dustImage('dark')}, linear-gradient(180deg, #221D18, #100E0C)`,
        border: '3px solid #000',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 3px 0 rgba(0,0,0,0.3)',
        color: CHROME.text,
        p: { xs: 2, md: 2.5 },
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1.1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)' },
        alignItems: 'center',
        gap: { xs: 1.5, md: 3 },
      }}
    >
      <Box sx={{ display: 'grid', gap: 1.75, gridColumn: { md: 'span 2' }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <WarningLight tone="overdue" count={overdue} label="Overdue" testId="light-overdue" />
        <WarningLight tone="soon" count={dueSoon} label="Due soon" testId="light-soon" />
      </Box>
      <Box sx={{ textAlign: 'center', minWidth: 0 }}>
        <Box sx={{ maxWidth: 200, mx: 'auto' }}>
          <Gauge percent={percent} />
        </Box>
        <Typography data-testid="record-check" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.2, color: CHROME.text }}>
          Record check {percent != null ? `${percent}%` : '—'}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: CHROME.secondary, lineHeight: 1.4 }}>
          {percent != null ? `Photo, receipt and value on file, across ${items} thing${items === 1 ? '' : 's'}` : 'Nothing recorded yet'}
        </Typography>
      </Box>
    </Box>
  );
}

// ── The lists ────────────────────────────────────────────────────────────────

function DueRow({ thing }) {
  const theme = useTheme();
  const due = thing.nextDue;
  const tone = statusTone(theme, due?.status, theme.palette.background.card);
  return (
    <Box component="li" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        component={RouterLink}
        to={thingPath(thing.id)}
        data-testid="attention-row"
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, px: 0.5, py: 1, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ width: 48, flexShrink: 0 }}>
          <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={3} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{thing.name}</Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {due ? `${due.label || dateKindLabel(due.kind)} · ${formatCalendarDate(dueDateOf(due))}` : ''}
            {thingWhereText(thing) ? ` · ${thingWhereText(thing)}` : ''}
          </Typography>
        </Box>
        {due ? (
          <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 800, color: tone, flexShrink: 0, textAlign: 'right' }}>
            {relativeDay(due.daysUntil)}
          </Typography>
        ) : null}
        <GoIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </ButtonBase>
    </Box>
  );
}

const panelSx = { minWidth: 0, border: 1, borderColor: 'border', borderRadius: '3px', bgcolor: 'background.card', backgroundImage: (t) => dustImage(t.palette.mode), p: { xs: 1.5, md: 2 } };

function DueGroup({ id, title, things, empty, tone }) {
  return (
    <Box component="section" aria-labelledby={`${id}-heading`} sx={panelSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, mb: 0.5, minHeight: 32 }}>
        {/* The marker light is lit only once something IS overdue / due. */}
        <SectionHeading id={`${id}-heading`} tone={things.length ? tone : 'livery'}>
          {title}
        </SectionHeading>
        <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {things.length}
        </Typography>
      </Box>
      {things.length ? (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {things.map((t) => (
            <DueRow key={t.id} thing={t} />
          ))}
        </Box>
      ) : (
        <Typography sx={{ px: 0.5, py: 1, fontSize: '0.875rem', color: 'text.secondary' }}>{empty}</Typography>
      )}
    </Box>
  );
}

/** The record check: a printed form, one line per gap. */
function RecordCheckList({ gaps }) {
  return (
    <Box component="section" aria-labelledby="record-check-heading" sx={{ border: 1, borderColor: 'border', borderRadius: '3px', bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 1.5, md: 2 }, pt: 1.5, pb: 1, borderBottom: '3px solid', borderColor: 'rule.main' }}>
        <SectionHeading id="record-check-heading" size="lg">
          Record check
        </SectionHeading>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.25 }}>Everything an insurer would ask for that isn't on file yet. Each opens the library showing exactly those things.</Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {gaps.map((g) => {
          const none = g.count === 0;
          return (
            <Box component="li" key={g.key} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
              <ButtonBase
                component={RouterLink}
                to={libraryLinkWith('missing', g.key)}
                data-testid={`gap-${g.key}`}
                data-done={none ? 'true' : 'false'}
                sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: { xs: 1.5, md: 2 }, py: 1.5, textAlign: 'left', justifyContent: 'flex-start', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <CheckSquare done={none} sx={{ mt: '2px' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary' }}>{g.title}</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25, lineHeight: 1.5 }}>{none ? 'None — nicely done.' : g.text}</Typography>
                </Box>
                <Typography component="span" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.375rem', lineHeight: 1, color: none ? 'text.secondary' : 'text.primary', fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
                  {g.count ?? '–'}
                </Typography>
                <GoIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default function AttentionView() {
  const { attention, loading, error, refetch } = useAttention();
  const { nodes, loading: treeLoading } = useThingTree();

  const { locationsCount, itemsCount, walkAt } = useMemo(() => {
    const locations = nodes.filter(isLocation);
    const places = nodes.filter((n) => isParentKind(kindOf(n)));
    return {
      locationsCount: locations.length,
      itemsCount: nodes.length - locations.length,
      walkAt: places.length === 1 ? places[0].id : null,
    };
  }, [nodes]);

  if (error && !attention) {
    return (
      <PageFrame>
        <GeekErrorState title="Needs attention didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 8 }} />
      </PageFrame>
    );
  }

  const a = attention ?? { overdue: [], dueSoon: [] };
  const gaps = GAP_CARDS.map((g) => ({ ...g, count: attention?.[g.field] ?? null }));
  const allClear = attention && itemsCount > 0 && !a.overdue.length && !a.dueSoon.length && gaps.every((g) => !g.count);
  const percent = treeLoading ? null : recordCheckPercent(attention, itemsCount);

  return (
    <PageFrame>
      <PageHeader title="Needs attention" lede="Dates that have passed or are close, then everything an insurer would ask for that isn't on file yet." />
      <Dashboard overdue={attention ? a.overdue.length : null} dueSoon={attention ? a.dueSoon.length : null} percent={percent} items={itemsCount} />
      {!loading && !treeLoading ? (
        <OnboardingChecklist locationsCount={locationsCount} itemsCount={itemsCount} missingIdPlate={attention?.missingIdPlate ?? 0} walkAt={walkAt} />
      ) : null}
      {allClear ? (
        <Box sx={{ ...panelSx, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          <DoneStamp />
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>All clear: nothing due and nothing missing.</Typography>
        </Box>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }} aria-busy={loading ? 'true' : undefined}>
        <DueGroup id="overdue" title="Overdue" tone="overdue" things={a.overdue} empty={loading ? 'Loading…' : 'Nothing overdue.'} />
        <DueGroup id="due-soon" title="Due in the next 30 days" tone="soon" things={a.dueSoon} empty={loading ? 'Loading…' : 'Nothing due in the next month.'} />
      </Box>
      <RecordCheckList gaps={gaps} />
    </PageFrame>
  );
}
