/**
 * What a Steam import WOULD do (the dry run), before it does it.
 *
 * A private profile returns an empty library, not an error (plan §12), so
 * `private` gets its own explanation instead of "0 games found".
 */
import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { formatHours } from '../../utils/dates';

export const PREVIEW_LIMIT = 8;

export function importSummary(preview) {
  const create = preview?.toCreate?.length ?? 0;
  const hours = preview?.toUpdateHours?.length ?? 0;
  const unchanged = preview?.unchanged ?? 0;
  return { total: preview?.total ?? create + hours + unchanged, create, hours, unchanged };
}

function Stat({ value, label }) {
  return (
    <Box sx={{ minWidth: 0, p: 1.25, borderRadius: 2, bgcolor: 'background.raised', border: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

export default function SteamPreview({ preview }) {
  if (!preview) return null;

  if (preview.configured === false) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        {preview.message || "Steam import isn't switched on for this server yet."}
      </Alert>
    );
  }

  if (preview.private) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }} data-testid="steam-private">
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>This Steam profile's game details are private</Typography>
        <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
          {preview.message ||
            'Steam only shares a library when the profile allows it.'}{' '}
          In Steam, open your profile → Edit Profile → Privacy Settings, and set <b>Game details</b> to <b>Public</b>. You can switch it back after the import.
        </Typography>
      </Alert>
    );
  }

  const s = importSummary(preview);
  const first = (preview.toCreate || []).slice(0, PREVIEW_LIMIT);

  return (
    <Box sx={{ mt: 2 }} data-testid="steam-preview">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
        <Stat value={s.total} label="in the Steam library" />
        <Stat value={s.create} label="new to GameGeek" />
        <Stat value={s.hours} label="hours to update" />
        <Stat value={s.unchanged} label="already up to date" />
      </Box>
      {first.length ? (
        <>
          <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mt: 2, mb: 0.5 }}>
            New games, first {first.length}
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {first.map((g) => (
              <Box component="li" key={g.steamAppId} sx={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                <Typography noWrap sx={{ fontSize: '0.875rem', minWidth: 0 }}>{g.title}</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatHours(g.hours) || 'Unplayed'}
                </Typography>
              </Box>
            ))}
          </Box>
          {s.create > first.length ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.muted', mt: 0.75 }}>…and {s.create - first.length} more.</Typography>
          ) : null}
        </>
      ) : null}
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1.5, lineHeight: 1.6 }}>
        Unplayed games land on Backlog; played ones on On hold. Hours come from Steam and only ever update Steam-sourced hours — anything you logged by hand is left alone. Running it again never makes duplicates.
      </Typography>
    </Box>
  );
}
