import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
  useTheme,
} from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { useUser, useThemeMode } from '@geeksuite/user';
import { GeekEmptyState, useToast } from '@geeksuite/ui';
import Panel from '../signalbox/Panel';
import { Dymo } from '../signalbox/Labels';

// ─── Option constants ───

const TIMEZONE_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'UTC',
];

const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文' },
];

const ACCENT_COLORS = [
  { value: '#e8a849', label: 'Amber' },
  { value: '#a99df0', label: 'Indigo' },
  { value: '#7dac8e', label: 'Sage' },
  { value: '#d4956a', label: 'Terracotta' },
  { value: '#6db5c0', label: 'Teal' },
  { value: '#c76b8e', label: 'Rose' },
  { value: '#d4b06a', label: 'Gold' },
];

/**
 * Account is the suite profile, drawn as Signal Box panels like every other
 * console page (2026-11-18 review: it was the one stock-Material screen).
 * One save per panel, each named for what it saves: Accent colour and Global
 * preferences used to be separate cards with separate Save buttons that both
 * saved the same record.
 */

/** "31 Dec 2024" — UserGeek's spelling of a date. */
function shortDate(value) {
  if (!value) return null;
  const d = new Date(Number.isFinite(Number(value)) ? Number(value) : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** The token from the Token board: brass for an admin, steel otherwise. */
function Token({ name, admin }) {
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        width: 72,
        height: 72,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.typography.fontFamilyMono,
        fontWeight: 700,
        fontSize: '1.4rem',
        color: admin ? theme.palette.box.plate.ink : '#ffffff',
        background: admin ? theme.palette.accent.gradient : 'linear-gradient(180deg, #5d6670, #2b3037)',
        border: `2px solid ${admin ? theme.palette.box.plate.edge : '#2b3037'}`,
        boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.4)',
      })}
    >
      {initialsOf(name)}
    </Box>
  );
}

function SaveButton({ saving, onClick, label }) {
  return (
    <Button
      variant="contained"
      onClick={onClick}
      disabled={saving}
      startIcon={saving ? <CircularProgress size={14} /> : null}
      sx={{ minHeight: 44, fontSize: '0.8125rem' }}
    >
      {saving ? 'Saving…' : label}
    </Button>
  );
}

// ─── Main component ───

export default function AccountPage() {
  const {
    identity, profile, preferences, appPreferences,
    loaded, loading: bootstrapLoading,
    bootstrap, updateProfile, updatePreferences, updateAppPreferences,
    error: storeError,
  } = useUser();

  // The suite-wide theme provider: this page hosts the Theme selector, so it
  // drives the provider directly instead of waiting for a Save round-trip.
  const { themePreference, setThemePreference } = useThemeMode();
  const theme = useTheme();
  const { notify } = useToast();

  // Section-level save states
  const [profileSaving, setProfileSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Local form state (initialized from store)
  const [profileForm, setProfileForm] = useState({});
  const [prefsForm, setPrefsForm] = useState({});
  const [identityForm, setIdentityForm] = useState({});

  // Bootstrap on mount
  useEffect(() => {
    if (!loaded && !bootstrapLoading) {
      bootstrap().catch(() => {});
    }
  }, [loaded, bootstrapLoading]);

  // The store's own load failure — surfaced the same way a local save
  // failure is, since by the time it would render this page has nothing
  // else to show for it (see the `!loaded` spinner branch below).
  useEffect(() => {
    if (storeError) notify(storeError, { tone: 'error' });
  }, [storeError, notify]);

  // Hydrate forms when store data arrives
  useEffect(() => {
    if (!loaded) return;
    setIdentityForm({
      username: identity?.username || '',
      email: identity?.email || '',
    });
    setProfileForm({
      displayName: profile?.displayName || '',
      bio: profile?.bio || '',
      timezone: profile?.timezone || 'America/Chicago',
      locale: profile?.locale || 'en-US',
      country: profile?.country || '',
    });
    setPrefsForm({
      theme: preferences?.theme || 'system',
      accentColor: preferences?.accentColor || '#e8a849',
      defaultApp: preferences?.defaultApp || '',
      dateFormat: preferences?.dateFormat || 'US',
      timeFormat: preferences?.timeFormat || '12h',
      startOfWeek: preferences?.startOfWeek || 'sunday',
    });
  }, [loaded, identity, profile, preferences]);

  // Handlers
  const handleProfileChange = (field) => (e) => {
    setProfileForm(prev => ({ ...prev, [field]: e.target.value }));
  };
  const handleIdentityChange = (field) => (e) => {
    setIdentityForm(prev => ({ ...prev, [field]: e.target.value }));
  };
  const handlePrefsChange = (field) => (e) => {
    setPrefsForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  // Theme is special: apply it live rather than on Save. The DB stores
  // 'system'; the provider's own vocabulary is 'auto', so normalize here.
  const handleThemeChange = (e) => {
    const value = e.target.value;
    setPrefsForm(prev => ({ ...prev, theme: value }));
    setThemePreference(value === 'system' ? 'auto' : value);
  };

  // Falls back to the live provider preference until the store hydrates, so
  // the selector always shows the mode actually in effect.
  const themeValue =
    prefsForm.theme || (themePreference === 'auto' ? 'system' : themePreference);

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      await updateProfile({
        ...identityForm,
        ...profileForm,
      });
      notify('Profile saved', { tone: 'success' });
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save profile', { tone: 'error' });
    } finally {
      setProfileSaving(false);
    }
  };

  const savePreferences = async () => {
    setPrefsSaving(true);
    try {
      await updatePreferences(prefsForm);
      notify('Preferences saved', { tone: 'success' });
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save preferences', { tone: 'error' });
    } finally {
      setPrefsSaving(false);
    }
  };

  if (!loaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress size={28} />
      </Box>
    );
  }

  const displayName = profileForm.displayName || identityForm.username || identityForm.email || '?';
  const isAdmin = identity?.role === 'admin';

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Your profile and preferences across all GeekSuite applications.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 3, alignItems: 'start' }}>

        {/* ── Left column: the token ── */}
        <Panel id="account-token" title="Token" headingComponent="h2" caption="Your sign-in for every app in the suite.">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Token name={displayName} admin={isAdmin} />
            <Box sx={{ textAlign: 'center', minWidth: 0, maxWidth: '100%' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'text.primary', overflowWrap: 'anywhere' }}>
                {profileForm.displayName || identityForm.username || 'No name set'}
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {identityForm.email}
              </Typography>
            </Box>
            {identity?.role && <Dymo tone={isAdmin ? 'red' : 'black'}>{identity.role}</Dymo>}

            <Divider flexItem />

            <Box sx={{ width: '100%' }}>
              {shortDate(identity?.createdAt) && (
                <DetailRow label="Member since" value={shortDate(identity.createdAt)} />
              )}
              {shortDate(identity?.lastLogin) && (
                <DetailRow label="Last login" value={shortDate(identity.lastLogin)} />
              )}
              <DetailRow label="Theme" value={themeValue} />
              {/* `locale` lives on the profile, not on preferences — this row
                  read `prefsForm.locale`, which is never populated, so it
                  rendered blank for every user since the card shipped.
                  Going-over 2026-09-05. */}
              <DetailRow label="Locale" value={profileForm.locale} />
            </Box>
          </Box>
        </Panel>

        {/* ── Right column: the panels ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>

          <Panel
            id="account-profile"
            number={1}
            title="Identity and profile"
            caption="Who you are to every app. Saved together."
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Display name"
                value={profileForm.displayName}
                onChange={handleProfileChange('displayName')}
                size="small"
                fullWidth
                placeholder="How should we greet you?"
                inputProps={{ autoComplete: 'name' }}
              />
              <TextField
                label="Username"
                value={identityForm.username}
                onChange={handleIdentityChange('username')}
                size="small"
                fullWidth
                inputProps={{ autoComplete: 'username', autoCapitalize: 'none', spellCheck: false }}
              />
              <TextField
                label="Email"
                type="email"
                value={identityForm.email}
                onChange={handleIdentityChange('email')}
                size="small"
                fullWidth
                inputProps={{ autoComplete: 'email', autoCapitalize: 'none', spellCheck: false, inputMode: 'email' }}
              />
              <TextField
                label="Bio"
                value={profileForm.bio}
                onChange={handleProfileChange('bio')}
                size="small"
                fullWidth
                placeholder="A short bio"
              />
              <FormControl size="small" fullWidth>
                <InputLabel id="account-timezone-label">Timezone</InputLabel>
                <Select labelId="account-timezone-label" value={profileForm.timezone} onChange={handleProfileChange('timezone')} label="Timezone">
                  {TIMEZONE_OPTIONS.map(tz => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="account-locale-label">Locale</InputLabel>
                <Select labelId="account-locale-label" value={profileForm.locale} onChange={handleProfileChange('locale')} label="Locale">
                  {LOCALE_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label="Country"
                value={profileForm.country}
                onChange={handleProfileChange('country')}
                size="small"
                fullWidth
                placeholder="e.g. US"
                inputProps={{ autoComplete: 'country' }}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
              <SaveButton saving={profileSaving} onClick={saveProfile} label="Save profile" />
            </Box>
          </Panel>

          <Panel
            id="account-preferences"
            number={2}
            title="Preferences"
            caption="Formats and colour every app reads. Theme applies at once; the rest is saved with the button below."
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="account-theme-label">Theme</InputLabel>
                <Select labelId="account-theme-label" value={themeValue} onChange={handleThemeChange} label="Theme">
                  <MenuItem value="dark">Dark</MenuItem>
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="system">System</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="account-date-format-label">Date format</InputLabel>
                <Select labelId="account-date-format-label" value={prefsForm.dateFormat} onChange={handlePrefsChange('dateFormat')} label="Date format">
                  <MenuItem value="US">MM/DD/YYYY</MenuItem>
                  <MenuItem value="EU">DD/MM/YYYY</MenuItem>
                  <MenuItem value="ISO">YYYY-MM-DD</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="account-time-format-label">Time format</InputLabel>
                <Select labelId="account-time-format-label" value={prefsForm.timeFormat} onChange={handlePrefsChange('timeFormat')} label="Time format">
                  <MenuItem value="12h">12-hour</MenuItem>
                  <MenuItem value="24h">24-hour</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="account-start-of-week-label">Start of week</InputLabel>
                <Select labelId="account-start-of-week-label" value={prefsForm.startOfWeek} onChange={handlePrefsChange('startOfWeek')} label="Start of week">
                  <MenuItem value="sunday">Sunday</MenuItem>
                  <MenuItem value="monday">Monday</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Default app"
                value={prefsForm.defaultApp}
                onChange={handlePrefsChange('defaultApp')}
                size="small"
                fullWidth
                placeholder="e.g. notegeek"
                inputProps={{ autoCapitalize: 'none', spellCheck: false }}
              />
            </Box>

            <Dymo component="h3" sx={{ mt: 3, mb: 1.5 }}>Accent colour</Dymo>
            <Box role="group" aria-label="Accent colour" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {ACCENT_COLORS.map(c => {
                const selected = prefsForm.accentColor === c.value;
                return (
                  <Box
                    key={c.value}
                    component="button"
                    type="button"
                    aria-label={c.label}
                    aria-pressed={selected}
                    onClick={() => setPrefsForm(prev => ({ ...prev, accentColor: c.value }))}
                    sx={{
                      width: 44,
                      height: 44,
                      p: 0,
                      borderRadius: '6px',
                      backgroundColor: c.value,
                      cursor: 'pointer',
                      border: selected ? `3px solid ${theme.palette.text.primary}` : `1px solid ${theme.palette.line.panel}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                    }}
                  >
                    {selected && <CheckIcon sx={{ fontSize: 20, color: theme.palette.accent.onBrightFill }} />}
                  </Box>
                );
              })}
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'fontFamilyMono' }}>
              {(ACCENT_COLORS.find(c => c.value === prefsForm.accentColor)?.label || 'Custom')} · {prefsForm.accentColor}
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
              <SaveButton saving={prefsSaving} onClick={savePreferences} label="Save preferences" />
            </Box>
          </Panel>

          <Panel
            id="account-apps"
            number={3}
            title="App preferences"
            caption="What each app has remembered for you. Change these inside the app."
          >
            {Object.keys(appPreferences || {}).length === 0 ? (
              <GeekEmptyState
                compact
                align="start"
                title="No app-specific preferences yet"
                description="As you use GeekSuite apps, their settings will appear here automatically."
                descriptionSx={{ fontSize: '0.8rem' }}
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Object.entries(appPreferences).map(([appName, prefs]) => (
                  <Box key={appName} sx={{
                    p: 1.5,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'line.panel',
                    bgcolor: 'surfaces.elevated',
                  }}>
                    <Typography sx={{
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      color: 'text.primary',
                      mb: 1,
                      fontFamily: 'fontFamilyMono',
                    }}>
                      {appName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {Object.entries(prefs || {}).map(([key, val]) => (
                        <Chip
                          key={key}
                          label={`${key}: ${val}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem', fontFamily: 'fontFamilyMono' }}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Panel>

        </Box>
      </Box>
    </Box>
  );
}

// ─── Detail row for the avatar card ───
function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.5 }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.primary', fontFamily: 'fontFamilyMono' }}>
        {value}
      </Typography>
    </Box>
  );
}
