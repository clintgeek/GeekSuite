/**
 * `/trash` — things moved to the Trash, each with the days it has left
 * before the backend purges it (and its photos and documents) and a
 * Restore. The window is the gateway's `thingVocabulary.trashDays`.
 *
 * Moving Day: the curb — boxes left out by the road, waiting for the haul
 * truck. Pick one back up (Restore) any time before it comes. The wording
 * stays "Trash" wherever it has to be plain (the nav, the confirm dialog).
 */
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { RestoreFromTrash as RestoreIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import MovingBox from '../components/MovingBox';
import ThingPhoto from '../components/ThingPhoto';
import { DISPLAY_FONT, OVERSIZE, dustImage } from '../theme/theme';
import { boxMarks } from '../utils/boxMarks';
import { coverSrc, thingMetaLine } from '../components/thingDisplay';
import { GET_TRASHED_THINGS } from '../graphql/queries';
import { useThingActions } from '../hooks/useThingActions';
import { useVocabulary } from '../hooks/useThingMeta';
import { daysUntilPurge, relativeInstant } from '../utils/dates';

export function purgeText(days) {
  if (days <= 0) return 'Purged at the next clean-up';
  if (days === 1) return 'Purged tomorrow';
  return `Purged in ${days} days`;
}

/** The kerb: concrete, its painted edge, the road. Decoration. */
export function Curb({ sx }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="curb"
      sx={{
        height: 22,
        backgroundImage: `linear-gradient(180deg, #A39C91 0 9px, ${OVERSIZE.ground} 9px 13px, #6E675E 13px 15px, #2B2622 15px 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
        ...sx,
      }}
    />
  );
}

export default function TrashView() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { trashDays } = useVocabulary();
  const { restoreThing } = useThingActions();
  const { data, loading, error, refetch } = useQuery(GET_TRASHED_THINGS, { fetchPolicy: 'cache-and-network' });
  const [busy, setBusy] = useState(null);
  const things = data?.trashedThings ?? [];

  const restore = async (thing) => {
    setBusy(thing.id);
    try {
      await restoreThing(thing.id);
      await refetch().catch(() => {});
      notify(`${thing.name} is back in the library.`, { tone: 'success' });
    } catch (err) {
      notify(err?.message || `Couldn't restore ${thing.name}.`, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (error && !data) {
    body = <GeekErrorState title="The Trash didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  } else if (loading && !data) {
    body = <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading…</Typography>;
  } else if (!things.length) {
    body = (
      <Box sx={{ textAlign: 'center', pt: 4, pb: 3, px: 2 }}>
        <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.375rem', mb: 0.5 }}>The Trash is empty</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>The curb is clear. Things you move to the Trash wait out here for {trashDays} days.</Typography>
      </Box>
    );
  } else {
    body = (
      <Box component="ul" aria-label="Trashed things" sx={{ m: 0, p: 0 }}>
        {things.map((t) => {
          const left = daysUntilPurge(t.deletedAt, trashDays);
          return (
            <Box component="li" key={t.id} data-testid="trash-row" sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, px: { xs: 0.5, sm: 1 }, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
              <Box sx={{ width: 52, flexShrink: 0, opacity: 0.8 }}>
                <ThingPhoto src={coverSrc(t)} icon={t.type?.icon} marks={boxMarks(t)} variant="thumb" radius={2} sx={{ transform: 'rotate(-4deg)' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{t.name}</Typography>
                <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {[thingMetaLine(t), t.deletedAt ? `Trashed ${relativeInstant(t.deletedAt).toLowerCase()}` : null].filter(Boolean).join(' · ')}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: left <= 3 ? 'error.main' : 'text.secondary' }} data-testid="purge-text">
                  {purgeText(left)}
                </Typography>
              </Box>
              <Button variant="outlined" startIcon={<RestoreIcon />} onClick={() => restore(t)} disabled={busy === t.id} sx={{ color: 'text.primary', borderColor: 'text.primary', fontWeight: 700, flexShrink: 0 }}>
                {busy === t.id ? 'Restoring…' : 'Restore'}
              </Button>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <PageFrame maxWidth={820}>
      <PageHeader
        title="Trash"
        lede={`Left at the curb: things moved to the Trash stay here for ${trashDays} days — pick one back up any time before the truck comes. After that it's purged for good, along with its photos and documents.`}
      />
      <Box sx={{ borderRadius: '3px', overflow: 'hidden', border: 1, borderColor: 'border', bgcolor: 'background.card', backgroundImage: (t) => dustImage(t.palette.mode) }}>
        {things.length ? null : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 1, pt: 3, mb: '-4px' }}>
            <MovingBox width={84} testId="curb-box" />
          </Box>
        )}
        <Box sx={{ px: { xs: 1, sm: 1.5 }, py: 0.5 }}>{body}</Box>
        <Curb />
      </Box>
      {things.length ? (
        <Button onClick={() => navigate('/')} sx={{ mt: 2, color: 'text.secondary' }}>
          Back to the library
        </Button>
      ) : null}
    </PageFrame>
  );
}
