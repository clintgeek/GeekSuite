/** Steam: preview the library (dry run), then import it. */
import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { useApolloClient, useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { importSteam } from '../../api/rest';
import { SAVE_GAME_PROFILE } from '../../graphql/mutations';
import { useProviders } from '../../hooks/useProviders';
import { formatCalendarDate } from '../../utils/dates';
import SettingsCard from './SettingsCard';
import SteamPreview, { importSummary } from './SteamPreview';

export default function SteamImportCard({ profile }) {
  const client = useApolloClient();
  const { notify } = useToast();
  const providers = useProviders();
  const [saveProfile] = useMutation(SAVE_GAME_PROFILE);
  const [steamId, setSteamId] = useState(profile?.steamId || '');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (profile?.steamId) setSteamId((v) => v || profile.steamId);
  }, [profile?.steamId]);

  const unavailable = providers && !providers.steamImport;

  const runPreview = async () => {
    setBusy('preview');
    setPreview(null);
    try {
      if (steamId.trim() && steamId.trim() !== (profile?.steamId || '')) {
        await saveProfile({ variables: { input: { steamId: steamId.trim() } } }).catch(() => {});
      }
      setPreview(await importSteam({ steamId, dryRun: true }));
    } catch (err) {
      notify(err?.message || 'The Steam preview failed.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    try {
      const result = await importSteam({ steamId, dryRun: false });
      const s = importSummary(preview);
      const created = result?.created ?? s.create;
      const updated = result?.hoursUpdated ?? s.hours;
      notify(`Steam import done — ${created} added, ${updated} hours updated.`, { tone: 'success' });
      setPreview(null);
      await client.refetchQueries({ include: ['GetGames', 'GetGameShelves', 'GetGameProfile'] });
    } catch (err) {
      notify(err?.message || 'The Steam import failed.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const s = importSummary(preview);
  const canCommit = preview && preview.configured !== false && !preview.private && (s.create > 0 || s.hours > 0);

  return (
    <SettingsCard
      id="steam"
      title="Import from Steam"
      description="Brings in every game on your Steam account with its playtime. You'll see exactly what changes before anything is written."
    >
      {unavailable ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Steam import needs a Steam Web API key on the GameGeek server (<code>STEAM_API_KEY</code>). Nothing to do on your side — once the key is in place, this lights up.
        </Alert>
      ) : null}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          runPreview();
        }}
        sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' } }}
      >
        <TextField
          label="Steam ID, custom URL name, or profile link"
          placeholder="steamcommunity.com/id/yourname"
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
          fullWidth
          disabled={unavailable}
          helperText="Any of: 7656119…, yourname, or the full profile URL"
        />
        <Button type="submit" variant="outlined" disabled={unavailable || Boolean(busy) || (!steamId.trim() && !profile?.steamId)} sx={{ minHeight: 56, flexShrink: 0, color: 'text.primary' }}>
          {busy === 'preview' ? 'Checking…' : 'Preview import'}
        </Button>
      </Box>
      {profile?.lastSteamSyncAt ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1 }}>
          Last synced {formatCalendarDate(profile.lastSteamSyncAt)}.
        </Typography>
      ) : null}

      <SteamPreview preview={preview} />

      {canCommit ? (
        <Button variant="contained" onClick={runImport} disabled={Boolean(busy)} sx={{ mt: 2 }}>
          {busy === 'import'
            ? 'Importing…'
            : s.create
              ? `Import ${s.create} ${s.create === 1 ? 'game' : 'games'}${s.hours ? ` and update ${s.hours}` : ''}`
              : `Update hours for ${s.hours} ${s.hours === 1 ? 'game' : 'games'}`}
        </Button>
      ) : null}
    </SettingsCard>
  );
}
