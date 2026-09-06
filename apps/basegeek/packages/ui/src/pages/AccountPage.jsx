import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Avatar,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
  useTheme,
} from '@mui/material';
import {
  Save as SaveIcon,
  Check as CheckIcon,
  Person as PersonIcon,
  Tune as TuneIcon,
  Palette as PaletteIcon,
  Apps as AppsIcon,
} from '@mui/icons-material';
import { useUser, useThemeMode } from '@geeksuite/user';
import { GeekEmptyState, useToast } from '@geeksuite/ui';

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

// ─── Section card component ───

function SectionCard({ title, icon, children, action }) {
  return (
    <Box sx={{
      p: 3,
      borderRadius: '12px',
      border: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'background.paper',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            {title}
          </Typography>
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}

// ─── Save button sub-component ───

// A successful save used to show its own auto-clearing "Saved" checkmark
// here (`saved` + a 3s `setTimeout`); that state and its UI collapsed into
// a single `notify(…, { tone: 'success' })` call at the call site (TODO_ORDER
// #15) — the toast stack is the one place a transient confirmation lives now.
function SaveButton({ saving, onClick, label = 'Save' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button
        size="small"
        variant="outlined"
        onClick={onClick}
        disabled={saving}
        startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 14 }} />}
        sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5, minWidth: 0 }}
      >
        {saving ? '...' : label}
      </Button>
    </Box>
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
  const accentColor = prefsForm.accentColor || '#e8a849';

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Your profile and preferences across all GeekSuite applications
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 3 }}>

        {/* ── Left column: avatar card ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{
            p: 3,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <Avatar sx={{
              width: 80,
              height: 80,
              bgcolor: accentColor,
              color: theme.palette.accent.onBrightFill,
              fontSize: '2rem',
              fontWeight: 700,
              fontFamily: '"Geist", sans-serif',
            }}>
              {displayName[0].toUpperCase()}
            </Avatar>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'text.primary' }}>
                {profileForm.displayName || identityForm.username || 'No name set'}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                {identityForm.email}
              </Typography>
            </Box>

            <Divider flexItem />

            <Box sx={{ width: '100%' }}>
              {identity?.createdAt && (
                <DetailRow label="Member since" value={new Date(identity.createdAt).toLocaleDateString()} />
              )}
              {identity?.lastLogin && (
                <DetailRow label="Last login" value={new Date(identity.lastLogin).toLocaleDateString()} />
              )}
              <DetailRow label="Theme" value={themeValue} />
              {/* `locale` lives on the profile, not on preferences — this row
                  read `prefsForm.locale`, which is never populated, so it
                  rendered blank for every user since the card shipped.
                  Going-over 2026-09-05. */}
              <DetailRow label="Locale" value={profileForm.locale} />
            </Box>
          </Box>
        </Box>

        {/* ── Right column: all sections ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* IDENTITY + PROFILE */}
          <SectionCard
            title="Identity & Profile"
            icon={<PersonIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            action={<SaveButton saving={profileSaving} onClick={saveProfile} />}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Display name"
                value={profileForm.displayName}
                onChange={handleProfileChange('displayName')}
                size="small"
                fullWidth
                placeholder="How should we greet you?"
              />
              <TextField
                label="Username"
                value={identityForm.username}
                onChange={handleIdentityChange('username')}
                size="small"
                fullWidth
              />
              <TextField
                label="Email"
                value={identityForm.email}
                onChange={handleIdentityChange('email')}
                size="small"
                fullWidth
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
              />
            </Box>
          </SectionCard>

          {/* GLOBAL PREFERENCES */}
          <SectionCard
            title="Global Preferences"
            icon={<TuneIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            action={<SaveButton saving={prefsSaving} onClick={savePreferences} />}
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
              />
            </Box>
          </SectionCard>

          {/* ACCENT COLOR */}
          <SectionCard
            title="Accent Color"
            icon={<PaletteIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            action={<SaveButton saving={prefsSaving} onClick={savePreferences} />}
          >
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              {ACCENT_COLORS.map(c => (
                <Box
                  key={c.value}
                  onClick={() => setPrefsForm(prev => ({ ...prev, accentColor: c.value }))}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    backgroundColor: c.value,
                    cursor: 'pointer',
                    border: prefsForm.accentColor === c.value
                      ? `2.5px solid ${theme.palette.text.primary}`
                      : '2.5px solid transparent',
                    transition: 'all 150ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': { transform: 'scale(1.1)' },
                  }}
                >
                  {prefsForm.accentColor === c.value && (
                    <CheckIcon sx={{ fontSize: 18, color: theme.palette.accent.onBrightFill }} />
                  )}
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: prefsForm.accentColor }} />
              <Typography sx={{ fontSize: '0.75rem', color: 'text.muted', fontFamily: '"Geist Mono", monospace' }}>
                {prefsForm.accentColor}
              </Typography>
            </Box>
          </SectionCard>

          {/* APP PREFERENCES */}
          <SectionCard
            title="App Preferences"
            icon={<AppsIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
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
                    p: 2,
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.default',
                  }}>
                    <Typography sx={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: 'text.primary',
                      mb: 1,
                      fontFamily: '"Geist Mono", monospace',
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
                          sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace' }}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>

        </Box>
      </Box>
    </Box>
  );
}

// ─── Detail row for the avatar card ───
function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.muted' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: '"Geist Mono", monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}
