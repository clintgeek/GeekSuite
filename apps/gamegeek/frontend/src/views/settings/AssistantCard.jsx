/**
 * The "Play assistant" switch (DOCS/WHAT_NEXT_SPEC.md, X9).
 *
 * `appPreferences.gamegeek.playAssistant`, default off. On, the library gets
 * a "What should I play?" strip: the gateway shortlists owned unplayed
 * games from the local vectors and lets a model rank them once per ask —
 * it is a suggestion, never a write. Optimistic like BookGeek's switch: a
 * failed save puts it straight back.
 */
import React, { useEffect, useState } from 'react';
import { FormControlLabel, Switch, Typography } from '@mui/material';
import { useAppPreferences } from '@geeksuite/user';
import SettingsCard from './SettingsCard';

export default function AssistantCard() {
  const { preferences: appPrefs, updateAppPreferences, loaded } = useAppPreferences('gamegeek');
  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loaded) return;
    // Anything but an explicit `true` is off — an absent key, a stale
    // string, a half-written preference document.
    setOn(appPrefs?.playAssistant === true);
  }, [loaded, appPrefs]);

  async function handleToggle(event) {
    const value = event.target.checked;
    setSaving(true);
    setError(null);
    setOn(value);
    try {
      await updateAppPreferences({ playAssistant: value });
    } catch (err) {
      setOn(!value);
      setError(err?.message || 'Failed to save preference.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      id="play-assistant"
      title="Play assistant"
      description="Adds a “What should I play?” strip above the library — owned, unplayed games picked by AI from your own favourites and recent plays. Off by default."
    >
      <FormControlLabel
        control={<Switch checked={on} onChange={handleToggle} disabled={saving || !loaded} />}
        label={on ? 'On — show what to play next' : 'Off'}
      />
      {error ? (
        <Typography role="alert" sx={{ color: 'error.main', fontSize: '0.8125rem', mt: 0.5 }}>
          {error}
        </Typography>
      ) : null}
    </SettingsCard>
  );
}
