import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Avatar,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Check as CheckIcon,
  Person as PersonIcon,
  Tune as TuneIcon,
  Palette as PaletteIcon,
  Apps as AppsIcon,
} from '@mui/icons-material';
import { useUser } from '@geeksuite/user';

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

function SaveButton({ saving, saved, onClick, label = 'Save' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {saved && (
        <Typography sx={{ fontSize: '0.75rem', color: 'success.main', display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <CheckIcon sx={{ fontSize: 14 }} /> Saved
        </Typography>
      )}
      <Button
        size="small"
        variant="outlined"
        onClick={onClick}
        disabled={saving}
        startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 14 }} />}
        sx={{ fontSize: '0.7rem', py: 0.5, px: 1.5, minWidth: 0 }}
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

  const [error, setError] = useState('');

  // Section-level save states
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

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
      theme: preferences?.theme || 'dark',
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
    setProfileSaved(false);
  };
  const handleIdentityChange = (field) => (e) => {
    setIdentityForm(prev => ({ ...prev, [field]: e.target.value }));
    setProfileSaved(false);
  };
  const handlePrefsChange = (field) => (e) => {
    setPrefsForm(prev => ({ ...prev, [field]: e.target.value }));
    setPrefsSaved(false);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setError('');
    try {
      await updateProfile({
        ...identityForm,
        ...profileForm,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const savePreferences = async () => {
    setPrefsSaving(true);
    setError('');
    try {
      await updatePreferences(prefsForm);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save preferences');
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
      <Typography variant="h4" sx={{ mb: 0.5 }}>Account</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Your profile and preferences across all GeekSuite applications
      </Typography>

      {(error || storeError) && <Alert severity="error" sx={{ mb: 3 }}>{error || storeError}</Alert>}

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
              color: '#0c0c0f',
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
              <DetailRow label="Theme" value={prefsForm.theme} />
              <DetailRow label="Locale" value={prefsForm.locale} />
            </Box>
          </Box>
        </Box>

        {/* ── Right column: all sections ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* IDENTITY + PROFILE */}
          <SectionCard
            title="Identity & Profile"
            icon={<PersonIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            action={<SaveButton saving={profileSaving} saved={profileSaved} onClick={saveProfile} />}
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
                <InputLabel>Timezone</InputLabel>
                <Select value={profileForm.timezone} onChange={handleProfileChange('timezone')} label="Timezone">
                  {TIMEZONE_OPTIONS.map(tz => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Locale</InputLabel>
                <Select value={profileForm.locale} onChange={handleProfileChange('locale')} label="Locale">
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
            action={<SaveButton saving={prefsSaving} saved={prefsSaved} onClick={savePreferences} />}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Theme</InputLabel>
                <Select value={prefsForm.theme} onChange={handlePrefsChange('theme')} label="Theme">
                  <MenuItem value="dark">Dark</MenuItem>
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="system">System</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Date format</InputLabel>
                <Select value={prefsForm.dateFormat} onChange={handlePrefsChange('dateFormat')} label="Date format">
                  <MenuItem value="US">MM/DD/YYYY</MenuItem>
                  <MenuItem value="EU">DD/MM/YYYY</MenuItem>
                  <MenuItem value="ISO">YYYY-MM-DD</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Time format</InputLabel>
                <Select value={prefsForm.timeFormat} onChange={handlePrefsChange('timeFormat')} label="Time format">
                  <MenuItem value="12h">12-hour</MenuItem>
                  <MenuItem value="24h">24-hour</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Start of week</InputLabel>
                <Select value={prefsForm.startOfWeek} onChange={handlePrefsChange('startOfWeek')} label="Start of week">
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
            action={<SaveButton saving={prefsSaving} saved={prefsSaved} onClick={savePreferences} />}
          >
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              {ACCENT_COLORS.map(c => (
                <Box
                  key={c.value}
                  onClick={() => { setPrefsForm(prev => ({ ...prev, accentColor: c.value })); setPrefsSaved(false); }}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    backgroundColor: c.value,
                    cursor: 'pointer',
                    border: prefsForm.accentColor === c.value ? '2.5px solid #e4dfd6' : '2.5px solid transparent',
                    transition: 'all 150ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': { transform: 'scale(1.1)' },
                  }}
                >
                  {prefsForm.accentColor === c.value && (
                    <CheckIcon sx={{ fontSize: 18, color: '#0c0c0f' }} />
                  )}
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: prefsForm.accentColor }} />
              <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: '"Geist Mono", monospace' }}>
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
              <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>
                No app-specific preferences yet. As you use GeekSuite apps, their settings will appear here automatically.
              </Typography>
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
                          sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace' }}
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
      <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontFamily: '"Geist Mono", monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}
