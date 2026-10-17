import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  CircularProgress,
  Button,
  ButtonBase,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  HealthAndSafety as HealthAlertIcon,
  Person as PersonIcon,
  Security as AccountIcon,
  ExpandMore as ExpandIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';
import { settingsService } from '../services/settingsService.js';
import { userService } from '../services/userService.js';
import logger from '../utils/logger.js';
import { errorMessage } from '../utils/errorMessage.js';
import { useThemeMode as useAppTheme } from '@geeksuite/user';
import HouseholdSettings from '../components/Settings/HouseholdSettings';
import ExperienceSettings from '../components/Settings/ExperienceSettings.jsx';
import HeightField from '../components/FitnessGoals/HeightField.jsx';
import { parseHeightToInches } from '../components/FitnessGoals/calorieCalc.js';
import { useExperience } from '../contexts/ExperienceContext.jsx';
import { Surface } from '../components/primitives';

/**
 * Settings — one page for everything about the person and the app (UX
 * review 2026-10-17, IA-2: Profile folded in; /profile lands on #you).
 *
 *   1. How it looks   Simple/Full, Larger text, Theme
 *   2. About you      the name the greeting uses, the goal, age/height/sex
 *   3. Household
 *   4. Garmin
 *   5. Health alerts
 *   6. Account        email, sign out
 *
 * EVERYTHING SAVES AS IT CHANGES (IA-3), with a quiet "Saved". The only
 * explicit button is the Garmin login, because a password half-typed must
 * never be sent. There is no "Unsaved changes" bar any more.
 *
 * Every write is PARTIAL — just the key that changed (CONTEXT.md, "Settings
 * writes are PARTIAL") — so a change made elsewhere since the page opened is
 * never overwritten. And nothing is written over a failed load: a section
 * whose read failed shows the error and a retry, never defaults with
 * switches that would save them (review P2; a Save over a failed load once
 * turned Garmin off).
 *
 * Simple (L17) shows How it looks and About you, then "More settings" for
 * the rest. Units are gone: nothing in the app read them.
 */

const SAVED = ['Saved', { tone: 'success', duration: 2000 }];
const COULDNT = 'Couldn’t save that. Try again.';

const GOALS = [
  { id: 'lose', title: 'Lose a little weight' },
  { id: 'maintain', title: 'Keep my weight steady' },
  { id: 'track', title: 'Just keep track' },
];

const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer-not-to-say', label: 'Rather not say' },
];

const plausibleAge = (v) => Number.isInteger(Number(v)) && Number(v) >= 13 && Number(v) <= 110;

function SectionTitle({ icon: Icon, children, id }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1.25 }}>
      {Icon && <Icon sx={{ color: 'primary.main' }} />}
      <Typography
        component="h2"
        id={id}
        sx={{ fontSize: '1.375rem', fontWeight: 800, color: 'text.primary', letterSpacing: '-0.01em' }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function GoalChoice({ selected, onClick, title }) {
  const theme = useTheme();
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        gap: 1.5,
        px: 2,
        minHeight: 56,
        width: '100%',
        borderRadius: '16px',
        border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
        bgcolor: selected ? theme.palette.produce?.lunch?.tint : 'background.paper',
        '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
          bgcolor: selected ? 'primary.main' : 'transparent',
          color: 'primary.contrastText',
          border: selected ? 'none' : `2px solid ${theme.palette.text.secondary}`,
        }}
      >
        {selected && <CheckIcon sx={{ fontSize: 18 }} />}
      </Box>
      <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: 'text.primary', textAlign: 'left' }}>{title}</Typography>
    </ButtonBase>
  );
}

/** "About you": the experience answers (their own store) and the profile. */
function AboutYou({ profile, profileError, onRetryProfile, onProfileSaved }) {
  const { notify } = useToast();
  const { preferredName, goal, update } = useExperience();
  const [name, setName] = useState(preferredName || '');

  // The stored name can arrive after the page draws (the experience read).
  const lastPreferred = useRef(preferredName);
  useEffect(() => {
    if (preferredName !== lastPreferred.current) {
      lastPreferred.current = preferredName;
      setName(preferredName || '');
    }
  }, [preferredName]);

  const saveExperience = async (patch) => {
    const result = await update(patch);
    if (result?.ok) notify(...SAVED);
    else notify(COULDNT, { tone: 'error' });
    return result;
  };

  const saveName = async () => {
    const next = name.trim();
    if (next === (preferredName || '')) return;
    const result = await saveExperience({ preferred_name: next || null });
    if (!result?.ok) setName(preferredName || '');
  };

  return (
    <Surface sx={{ mb: 2, borderRadius: '24px' }} id="you" data-testid="about-you">
      <SectionTitle icon={PersonIcon}>About you</SectionTitle>

      <TextField
        fullWidth
        label="What should I call you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        inputProps={{ maxLength: 40, autoComplete: 'given-name' }}
        helperText="The name I greet you with."
        sx={{ mb: 3 }}
      />

      <Typography id="settings-goal-label" sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}>Your goal</Typography>
      <Box role="radiogroup" aria-labelledby="settings-goal-label" sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
        {GOALS.map((g) => (
          <GoalChoice
            key={g.id}
            selected={goal === g.id}
            title={g.title}
            onClick={() => { if (goal !== g.id) saveExperience({ goal: g.id }); }}
          />
        ))}
      </Box>

      {profileError ? (
        <GeekErrorState title="Couldn’t load your details" description={profileError} onRetry={onRetryProfile} />
      ) : !profile ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} aria-label="Loading your details" /></Box>
      ) : (
        <ProfileFields profile={profile} onProfileSaved={onProfileSaved} />
      )}
    </Surface>
  );
}

/** Age, height and sex — on the baseGeek profile, each saved as it changes. */
function ProfileFields({ profile, onProfileSaved }) {
  const { notify } = useToast();
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');

  const saveProfile = async (patch) => {
    try {
      await userService.updateProfile(patch);
      onProfileSaved(patch);
      notify(...SAVED);
      return true;
    } catch (err) {
      logger.error('Error saving profile:', err);
      notify(errorMessage(err, COULDNT), { tone: 'error' });
      return false;
    }
  };

  const saveAge = async () => {
    if (!plausibleAge(age) || Number(age) === Number(profile?.age)) return;
    const ok = await saveProfile({ age: Number(age) });
    if (!ok) setAge(profile?.age ? String(profile.age) : '');
  };

  const saveHeight = async (joined) => {
    if (!joined) return;
    if (parseHeightToInches(joined) === parseHeightToInches(profile?.height)) return;
    await saveProfile({ height: joined });
  };

  return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
            Used to work out your calorie target.
          </Typography>
          <TextField
            label="Age"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            onBlur={saveAge}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            error={age !== '' && !plausibleAge(age)}
            helperText={age !== '' && !plausibleAge(age) ? 'An age from 13 to 110.' : undefined}
            inputProps={{ inputMode: 'numeric' }}
          />
          <HeightField idPrefix="settings-height" value={profile.height || ''} onBlur={saveHeight} />
          <FormControl fullWidth>
            <InputLabel id="settings-sex-label">Sex</InputLabel>
            <Select
              labelId="settings-sex-label"
              label="Sex"
              value={profile.gender || ''}
              onChange={(e) => saveProfile({ gender: e.target.value })}
            >
              {SEXES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
  );
}

const Settings = () => {
  const { themePreference, setThemePreference } = useAppTheme();
  const { user, logout } = useAuth() || {};
  const { isSimple } = useExperience();
  const { notify } = useToast();

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [garminUsername, setGarminUsername] = useState('');
  const [garminUsernameSaved, setGarminUsernameSaved] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminSaving, setGarminSaving] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Simple keeps the rest folded away — opened by default only when a link
  // points into it (#account and the like).
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      const hash = window.location.hash.replace('#', '');
      return Boolean(hash) && !['you', 'looks'].includes(hash);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    loadSettings();
    loadProfile();
  }, []);

  // /profile redirects to /settings#you: once the page has drawn, bring the
  // section into view.
  useEffect(() => {
    if (loading) return;
    let hash = '';
    try { hash = window.location.hash.replace('#', ''); } catch { /* none */ }
    if (!hash) return;
    const el = document.getElementById(hash);
    el?.scrollIntoView?.({ block: 'start' });
  }, [loading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await settingsService.getSettings();
      const loaded = response?.data;
      if (!loaded || typeof loaded !== 'object') throw new Error('No settings in the response');
      const g = loaded.garmin || settingsService.getDefaultGarminSettings();
      setGarminUsername(g.username || '');
      setGarminUsernameSaved(g.username || '');
      setGarminPassword('');
      setSettings({ ...loaded, garmin: { enabled: !!g.enabled, username: g.username || '' } });
    } catch (err) {
      // No defaults: a save over a failed load used to write them back and
      // turn Garmin off. Say so, offer a retry, and keep the switches away.
      logger.error('Error loading settings:', err);
      setLoadError(errorMessage(err, 'Couldn’t load your settings. Try again.'));
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      setProfileError(null);
      const data = await userService.getProfile();
      if (!data || typeof data !== 'object') throw new Error('No profile in the response');
      setProfile({
        email: data.email || '',
        age: data.profile?.age || '',
        height: data.profile?.height || '',
        gender: data.profile?.gender || '',
      });
    } catch (err) {
      logger.error('Error loading profile:', err);
      setProfile(null);
      setProfileError(errorMessage(err, 'Couldn’t load your details. Try again.'));
    }
  };

  /**
   * One section, saved the moment it changes. Optimistic; on failure the
   * section goes back to what it was and the person is told.
   */
  const saveSection = async (key, value) => {
    if (!settings) return;
    const before = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await settingsService.updateSettings({ [key]: value });
      notify(...SAVED);
    } catch (err) {
      logger.error('Error saving settings:', err);
      setSettings((prev) => ({ ...prev, [key]: before }));
      notify(errorMessage(err, COULDNT), { tone: 'error' });
    }
  };

  const handleThemeChange = (newTheme) => {
    // The theme is the account's, suite-wide (@geeksuite/user saves it);
    // nothing reads a FitnessGeek copy of it.
    setThemePreference(newTheme);
    notify(...SAVED);
  };

  const toggleGarmin = async (enabled) => {
    const before = settings.garmin;
    setSettings((prev) => ({ ...prev, garmin: { ...prev.garmin, enabled } }));
    try {
      await settingsService.updateSettings({ garmin: { enabled } });
      notify(...SAVED);
    } catch (err) {
      logger.error('Error saving Garmin:', err);
      setSettings((prev) => ({ ...prev, garmin: before }));
      notify(errorMessage(err, COULDNT), { tone: 'error' });
    }
  };

  const connected = Boolean(garminUsernameSaved);
  const garminLoginChanged = garminUsername.trim() !== garminUsernameSaved || Boolean(garminPassword);

  const saveGarminLogin = async () => {
    if (!settings || !garminLoginChanged) return;
    try {
      setGarminSaving(true);
      await settingsService.updateSettings({
        garmin: {
          enabled: true,
          username: garminUsername.trim(),
          ...(garminPassword ? { password: garminPassword } : {}),
        },
      });
      setGarminUsernameSaved(garminUsername.trim());
      setGarminPassword('');
      setSettings((prev) => ({ ...prev, garmin: { ...prev.garmin, enabled: true, username: garminUsername.trim() } }));
      notify(...SAVED);
    } catch (err) {
      logger.error('Error saving Garmin login:', err);
      notify(errorMessage(err, 'Couldn’t save your Garmin login. Try again.'), { tone: 'error' });
    } finally {
      setGarminSaving(false);
    }
  };

  const themeSelect = (
    <FormControl fullWidth sx={{ mt: 2.5 }}>
      <InputLabel id="settings-theme-label">Theme</InputLabel>
      <Select
        labelId="settings-theme-label"
        value={themePreference}
        onChange={(e) => handleThemeChange(e.target.value)}
        label="Theme"
      >
        <MenuItem value="light">Light</MenuItem>
        <MenuItem value="dark">Dark</MenuItem>
        <MenuItem value="auto">Same as my device</MenuItem>
      </Select>
    </FormControl>
  );

  const settingsSections = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 160 }}>
          <CircularProgress aria-label="Loading settings" />
        </Box>
      );
    }
    if (!settings) {
      return (
        <GeekErrorState
          title="Couldn’t load settings"
          description={loadError || 'Couldn’t load your settings. Try again.'}
          onRetry={loadSettings}
        />
      );
    }
    return (
      <>
        {/* Garmin */}
        <Surface sx={{ mb: 2 }} id="garmin">
          <SectionTitle icon={BPIcon}>Garmin</SectionTitle>
          <FormControlLabel
            control={
              <Switch
                checked={!!settings.garmin?.enabled}
                onChange={(e) => toggleGarmin(e.target.checked)}
              />
            }
            label="Use my Garmin watch"
            sx={{ mb: 2, display: 'flex' }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              fullWidth
              label="Garmin email"
              type="email"
              autoComplete="username"
              value={garminUsername}
              onChange={(e) => setGarminUsername(e.target.value)}
              placeholder="your@email.com"
              disabled={!settings.garmin?.enabled}
              helperText="The email you use for Garmin Connect"
            />
            <TextField
              fullWidth
              label="Garmin password"
              type="password"
              autoComplete="current-password"
              value={garminPassword}
              onChange={(e) => setGarminPassword(e.target.value)}
              placeholder={connected ? 'Leave blank to keep it' : ''}
              disabled={!settings.garmin?.enabled}
              helperText="Never stored in plain text"
            />
          </Box>
          {settings.garmin?.enabled && (
            <Button
              variant="contained"
              onClick={saveGarminLogin}
              disabled={garminSaving || !garminLoginChanged || !garminUsername.trim() || (!connected && !garminPassword)}
              startIcon={garminSaving ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ mt: 2, minHeight: 44 }}
            >
              {garminSaving ? 'Saving…' : connected ? 'Save Garmin login' : 'Connect Garmin'}
            </Button>
          )}
        </Surface>

        {/* Health alerts — per-user opt-outs (settings.health_alerts, default on) */}
        <Surface sx={{ mb: 2 }} id="health-alerts">
          <SectionTitle icon={HealthAlertIcon}>Health alerts</SectionTitle>
          <FormControlLabel
            control={
              <Switch
                checked={settings.health_alerts?.sleep_apnea_screening !== false}
                onChange={(e) => saveSection('health_alerts', { ...(settings.health_alerts || {}), sleep_apnea_screening: e.target.checked })}
              />
            }
            label="Sleep apnea screening suggestion"
            sx={{ display: 'flex' }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Suggests screening when your watch records blood-oxygen dips overnight. Wrist readings are noisy with movement and sleep position — turn this off if you’ve already discussed them with your doctor.
          </Typography>
        </Surface>
      </>
    );
  };

  const rest = (
    <>
      {/* Household — once, here (it used to be on Profile too). */}
      <Box sx={{ mb: 2 }} id="household">
        <HouseholdSettings />
      </Box>

      {settingsSections()}

      {/* Account */}
      <Surface sx={{ mb: 2 }} id="account">
        <SectionTitle icon={AccountIcon}>Account</SectionTitle>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>Signed in as</Typography>
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, wordBreak: 'break-word', mb: 2 }} data-testid="account-email">
          {profile?.email || user?.email || ''}
        </Typography>
        <Button variant="outlined" color="error" onClick={() => logout?.()} sx={{ minHeight: 44 }}>
          Sign out
        </Button>
      </Surface>
    </>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 820, mx: 'auto' }}>
      {/* The top bar already says "Settings"; the page doesn't repeat it. */}
      <ExperienceSettings id="looks">{themeSelect}</ExperienceSettings>

      <AboutYou
        profile={profile}
        profileError={profileError}
        onRetryProfile={loadProfile}
        onProfileSaved={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
      />

      {isSimple ? (
        <>
          <Button
            fullWidth
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="more-settings"
            endIcon={<ExpandIcon sx={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ minHeight: 56, mb: 2, fontSize: '1.0625rem', fontWeight: 700, justifyContent: 'space-between', px: 2.5, borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}
          >
            More settings
          </Button>
          <Collapse in={moreOpen} id="more-settings" unmountOnExit>
            {rest}
          </Collapse>
        </>
      ) : rest}
    </Box>
  );
};

export default Settings;
