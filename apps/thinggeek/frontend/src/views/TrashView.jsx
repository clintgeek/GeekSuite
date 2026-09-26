/**
 * `/trash` — things moved to the Trash, each with the days it has left
 * before the backend purges it (and its photos and documents) and a
 * Restore. The window is the gateway's `thingVocabulary.trashDays`.
 */
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { RestoreFromTrash as RestoreIcon, DeleteOutline as TrashIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import ThingPhoto from '../components/ThingPhoto';
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
      <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
        <TrashIcon aria-hidden="true" sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>The Trash is empty</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>Things you move to the Trash wait here for {trashDays} days.</Typography>
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
                <ThingPhoto src={coverSrc(t)} icon={t.type?.icon} variant="thumb" radius={6} />
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
              <Button variant="outlined" startIcon={<RestoreIcon />} onClick={() => restore(t)} disabled={busy === t.id} sx={{ color: 'text.primary', flexShrink: 0 }}>
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
        lede={`Things moved to the Trash stay here for ${trashDays} days — restore one any time before then. After that it's purged for good, along with its photos and documents.`}
      />
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', px: { xs: 1, sm: 1.5 }, py: 0.5 }}>{body}</Box>
      {things.length ? (
        <Button onClick={() => navigate('/')} sx={{ mt: 2, color: 'text.secondary' }}>
          Back to the library
        </Button>
      ) : null}
    </PageFrame>
  );
}
