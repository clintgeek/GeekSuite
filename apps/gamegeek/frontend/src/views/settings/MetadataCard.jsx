/**
 * Settings, "Metadata" card: counts, which providers are configured, and a
 * button to run the enrichment worker now (DOCS/METADATA_ENRICHMENT.md). The
 * status only polls while the worker is running (useMetadataStatus) — when
 * a run finishes, the library queries refetch so new covers and details
 * show up without a reload.
 */
import React, { useCallback, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { PlayArrow as RunIcon } from '@mui/icons-material';
import { useApolloClient } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { runEnrich } from '../../api/rest';
import { useMetadataStatus } from '../../hooks/useMetadataEnrichment';
import { relativeDay } from '../../utils/dates';
import SettingsCard from './SettingsCard';

const STATS = [
  ['matched', 'Matched'],
  ['pending', 'Waiting'],
  ['noMatch', 'No match'],
  ['ambiguous', 'Needs a choice'],
  ['error', 'Errors'],
];

const PROVIDER_LABELS = { steam: 'Steam', igdb: 'IGDB', rawg: 'RAWG' };

function Stat({ value, label }) {
  return (
    <Box sx={{ minWidth: 0, p: 1.25, borderRadius: 2, bgcolor: 'background.raised', border: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? 0}
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

function ProviderChip({ id, on }) {
  return (
    <Box
      data-testid={`provider-${id}`}
      data-provider-on={on ? 'true' : 'false'}
      sx={{
        px: 1.25,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '6px',
        bgcolor: 'background.raised',
        border: 1,
        borderColor: on ? 'success.main' : 'divider',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: on ? 'text.primary' : 'text.secondary',
      }}
    >
      {PROVIDER_LABELS[id]}
      {on ? '' : ' — off'}
    </Box>
  );
}

export default function MetadataCard() {
  const client = useApolloClient();
  const { notify } = useToast();
  const [starting, setStarting] = useState(false);

  const refetchLibrary = useCallback(
    () => client.refetchQueries({ include: ['GetGames', 'GetGameShelves', 'GetGameProfile'] }),
    [client]
  );
  const { status, error, reload } = useMetadataStatus({ onFinished: refetchLibrary });

  const handleRun = async () => {
    setStarting(true);
    try {
      await runEnrich();
      await reload();
    } catch (err) {
      notify(err?.message || "Couldn't start the metadata run.", { tone: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const counts = status?.counts || {};
  const providers = status?.providers || { steam: true, igdb: false, rawg: false };
  const running = Boolean(status?.running);
  const needsKeys = !providers.igdb || !providers.rawg;

  return (
    <SettingsCard
      id="metadata"
      title="Metadata & covers"
      description="Fills in descriptions, developers, genres and cover art from Steam, IGDB and RAWG — it never overwrites anything you've already entered."
    >
      {error ? (
        <Typography sx={{ fontSize: '0.8125rem', color: 'error.main', mb: 1.5 }} data-testid="metadata-error">
          {error}
        </Typography>
      ) : null}

      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}
        data-testid="metadata-counts"
      >
        {STATS.map(([key, label]) => (
          <Stat key={key} value={counts[key]} label={label} />
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
        <ProviderChip id="steam" on={Boolean(providers.steam)} />
        <ProviderChip id="igdb" on={Boolean(providers.igdb)} />
        <ProviderChip id="rawg" on={Boolean(providers.rawg)} />
      </Box>

      {needsKeys ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1, lineHeight: 1.6 }}>
          IGDB and RAWG need API keys in GameGeek's server settings; Steam works without one.
        </Typography>
      ) : null}

      <Button
        variant="contained"
        startIcon={<RunIcon />}
        onClick={handleRun}
        disabled={running || starting}
        sx={{ mt: 2 }}
      >
        {running ? 'Running…' : starting ? 'Starting…' : 'Run now'}
      </Button>

      {running ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }} data-testid="metadata-running">
          <CircularProgress size={18} aria-label="Looking up metadata" />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            Looking things up{Number.isFinite(status?.queued) ? ` — ${status.queued} left` : ''}…
          </Typography>
        </Box>
      ) : null}

      {status?.lastRunAt ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1.5 }}>
          Last ran {relativeDay(status.lastRunAt)}
        </Typography>
      ) : null}
    </SettingsCard>
  );
}
