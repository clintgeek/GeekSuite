/**
 * `/attention` — what needs doing: dates that have passed or are close
 * (thingAttention.overdue / dueSoon, the server's 30-day window), then the
 * insurance gaps as counts, each a door into the library pre-filtered to
 * exactly those things (`/?missing=receipt`).
 */
import React from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import {
  AddAPhotoOutlined as PhotoIcon,
  AttachMoney as ValueIcon,
  ChevronRight as GoIcon,
  NumbersOutlined as SerialIcon,
  QrCode2Outlined as PlateIcon,
  ReceiptLongOutlined as ReceiptIcon,
  TaskAlt as ClearIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { GeekErrorState } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import ThingPhoto from '../components/ThingPhoto';
import { statusTone } from '../components/DueLine';
import { coverSrc, thingPlaceText } from '../components/thingDisplay';
import { thingPath } from '../components/navConfig';
import { useAttention } from '../hooks/useThingMeta';
import { DISPLAY_FONT } from '../theme/theme';
import { dueDateOf, formatCalendarDate, relativeDay } from '../utils/dates';
import { libraryLinkWith } from '../utils/libraryFilter';
import { dateKindLabel } from '../utils/vocab';

export const GAP_CARDS = [
  { key: 'id-plate', field: 'missingIdPlate', title: 'No ID-plate photo', text: 'The plate carries the model and serial — the photo an adjuster asks for first.', icon: PlateIcon },
  { key: 'receipt', field: 'missingReceipt', title: 'No receipt', text: 'Proof of purchase and price, as a photo or a PDF.', icon: ReceiptIcon },
  { key: 'serial', field: 'missingSerial', title: 'Serial missing', text: 'A type with a serial field, and the field is empty.', icon: SerialIcon },
  { key: 'value', field: 'missingValue', title: 'No value', text: "The insurance report can't total what isn't there.", icon: ValueIcon },
  { key: 'photo', field: 'missingPhoto', title: 'No photo', text: 'Not even one. Start with the overview.', icon: PhotoIcon },
];

function DueRow({ thing }) {
  const theme = useTheme();
  const due = thing.nextDue;
  const tone = statusTone(theme, due?.status, theme.palette.background.card);
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        component={RouterLink}
        to={thingPath(thing.id)}
        data-testid="attention-row"
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ width: 48, flexShrink: 0 }}>
          <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={6} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{thing.name}</Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {due ? `${due.label || dateKindLabel(due.kind)} · ${formatCalendarDate(dueDateOf(due))}` : ''}
            {thingPlaceText(thing) ? ` · ${thingPlaceText(thing)}` : ''}
          </Typography>
        </Box>
        {due ? (
          <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: tone, flexShrink: 0, textAlign: 'right' }}>
            {relativeDay(due.daysUntil)}
          </Typography>
        ) : null}
        <GoIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </ButtonBase>
    </Box>
  );
}

function DueGroup({ id, title, things, empty }) {
  return (
    <Box component="section" aria-labelledby={`${id}-heading`} sx={{ minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', px: 0.5, mb: 0.5 }}>
        <Typography id={`${id}-heading`} component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.0625rem' }}>
          {title}
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
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

export default function AttentionView() {
  const { attention, loading, error, refetch } = useAttention();

  if (error && !attention) {
    return (
      <PageFrame>
        <GeekErrorState title="Needs attention didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 8 }} />
      </PageFrame>
    );
  }

  const a = attention ?? { overdue: [], dueSoon: [] };
  const gaps = GAP_CARDS.map((g) => ({ ...g, count: attention?.[g.field] ?? null }));
  const allClear = attention && !a.overdue.length && !a.dueSoon.length && gaps.every((g) => !g.count);

  return (
    <PageFrame>
      <PageHeader title="Needs attention" lede="Dates that have passed or are close, then everything an insurer would ask for that isn't on file yet." />
      {allClear ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 2, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.card' }}>
          <ClearIcon sx={{ color: 'primary.main' }} aria-hidden="true" />
          <Typography sx={{ fontSize: '0.9375rem' }}>All clear — nothing due and nothing missing.</Typography>
        </Box>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 4 }} aria-busy={loading ? 'true' : undefined}>
        <DueGroup id="overdue" title="Overdue" things={a.overdue} empty={loading ? 'Loading…' : 'Nothing overdue.'} />
        <DueGroup id="due-soon" title="Due in the next 30 days" things={a.dueSoon} empty={loading ? 'Loading…' : 'Nothing due in the next month.'} />
      </Box>

      <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.25rem', mb: 0.5 }}>
        Gaps in the record
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>Each opens the library showing exactly those things.</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {gaps.map((g) => {
          const Icon = g.icon;
          const none = g.count === 0;
          return (
            <Box component="li" key={g.key}>
              <ButtonBase
                component={RouterLink}
                to={libraryLinkWith('missing', g.key)}
                data-testid={`gap-${g.key}`}
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  p: 2,
                  borderRadius: 3,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.card',
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'plate.ground', color: 'plate.icon' }}>
                  <Icon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary' }}>{g.title}</Typography>
                    <Typography component="span" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.375rem', lineHeight: 1, color: none ? 'text.secondary' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                      {g.count ?? '–'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>{none ? 'None — nicely done.' : g.text}</Typography>
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </PageFrame>
  );
}
