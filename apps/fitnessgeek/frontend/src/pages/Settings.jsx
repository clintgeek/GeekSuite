import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  CircularProgress,
  Button,
  ButtonBase,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  Check as CheckIcon,
  ChevronRight as ChevronIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
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
import { LabelPanel, Page } from '../components/primitives';
import { SWITCH_ROW } from '../components/Settings/switchRow.js';
import { Disclosure } from '../components/FitnessGoals/PlanResult.jsx';
import { fmt } from '../utils/plainWords.js';

/**
 * Settings — one page for everything about the person and the app (UX
 * review 2026-10-17, IA-2: Profile folded in; /profile lands on #you).
 *
 * What people change most comes first; what is set up once comes last:
 *
 *   1. How it looks       Larger text, Theme
 *   2. About you          the name the greeting uses, the goal, age/height/sex
 *   3. Calorie plan       the way to the plan, with today's target
 *   4. Household
 *   5. Connected devices  the Garmin watch (its login folded away once it
 *                         is connected, its sleep suggestion only while the
 *                         watch is on) and body scans from the scale
 *   6. Account            email, sign out
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
 * Units are gone: nothing in the app read them. Calorie plan and Import a
 * scan have no row in the navigation (DOCS/ONE_APP_PLAN.md §3); their rows
 * here are one of the ways to them.
 *
 * A save that fails says so in a toast AND beside the field, and what was
 * typed stays in the field: leaving it again retries.
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

function GoalChoice({ selected, onClick, title }) {
  const theme = useTheme();
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        gap: 3,
        px: selected ? 3 : 'calc(12px + 1px)',
        minHeight: 52,
        width: '100%',
        borderRadius: '12px',
        // The chosen one: a 2px blue border and a blue tick, no tinted fill.
        border: selected ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
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
      <Typography sx={{ fontSize: '1.0625rem', fontWeight: 600, color: 'text.primary', textAlign: 'left' }}>{title}</Typography>
    </ButtonBase>
  );
}

/** A switch row's words: what it is, and one quiet line about it. */
const RowWords = ({ title, body }) => (
  <Box>
    <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
    {body && <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>{body}</Typography>}
  </Box>
);

/** A row that goes somewhere: name, one short line, a chevron. */
function LinkRow({ to, title, body, ...rest }) {
  return (
    <ButtonBase
      component={RouterLink}
      to={to}
      {...rest}
      sx={{
        display: 'flex',
        width: '100%',
        justifyContent: 'space-between',
        textAlign: 'left',
        gap: 4,
        minHeight: 56,
        py: 2,
        color: 'text.primary',
        borderRadius: '8px',
        '@media (hover: hover)': { '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.04) } },
        '&:focus-visible': { outline: (t) => `3px solid ${t.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        {body && <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>{body}</Typography>}
      </Box>
      <ChevronIcon aria-hidden sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </ButtonBase>
  );
}

/**
 * Saves what was typed when a field goes away WITHOUT a blur (SUITE_REVIEW
 * 2026-11 FitnessGeek #7). These fields save on blur, but Android Back or a
 * bottom-nav tap can unmount the page with the field still focused, and a
 * focused input that is removed fires no blur: the edit was silently lost on
 * a page that promises "saves as it changes". The app going to the
 * background flushes too, since a backgrounded PWA may never come back. Each
 * `flush` must be a no-op when nothing changed, because a blur may already
 * have saved it.
 */
function useFlushOnLeave(flush) {
  const ref = useRef(flush);
  ref.current = flush;
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') ref.current(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      ref.current();
    };
  }, []);
}

/** "About you": the experience answers (their own store) and the profile. */
function AboutYou({ profile, profileError, onRetryProfile, onProfileSaved }) {
  const { notify } = useToast();
  const { preferredName, goal, update } = useExperience();
  const [name, setName] = useState(preferredName || '');
  const [nameError, setNameError] = useState(false);

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

  // The last name saved or being saved, so a blur and a leave never send it twice.
  const savedName = useRef(preferredName || '');
  useEffect(() => { savedName.current = preferredName || ''; }, [preferredName]);
  const saveName = async () => {
    const next = name.trim();
    if (next === savedName.current) return;
    const before = savedName.current;
    savedName.current = next;
    setNameError(false);
    const result = await saveExperience({ preferred_name: next || null });
    if (!result?.ok) {
      // What was typed stays in the field, with the failure said beside it;
      // leaving the field again retries (it used to snap back to the old name).
      savedName.current = before;
      setNameError(true);
    }
  };
  useFlushOnLeave(saveName);

  return (
    <LabelPanel title="About you" titleComponent="h2" id="you" data-testid="about-you">
      <Box sx={{ height: 8 }} />

      <TextField
        fullWidth
        label="What should I call you?"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameError(false); }}
        onBlur={saveName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        inputProps={{ maxLength: 40, autoComplete: 'given-name' }}
        error={nameError}
        helperText={nameError ? COULDNT : 'The name I greet you with.'}
        sx={{ mb: 6 }}
      />

      <Typography id="settings-goal-label" sx={{ fontWeight: 600, fontSize: '1rem', mb: 2 }}>Your goal</Typography>
      <Box role="radiogroup" aria-labelledby="settings-goal-label" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 6 }}>
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
    </LabelPanel>
  );
}

/** Age, height and sex — on the baseGeek profile, each saved as it changes. */
function ProfileFields({ profile, onProfileSaved }) {
  const { notify } = useToast();
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  // Which field's save failed, said beside it: 'age' | 'height' | 'gender'.
  const [failed, setFailed] = useState(null);

  const saveProfile = async (patch) => {
    const field = Object.keys(patch)[0];
    setFailed((f) => (f === field ? null : f));
    try {
      await userService.updateProfile(patch);
      onProfileSaved(patch);
      notify(...SAVED);
      return true;
    } catch (err) {
      logger.error('Error saving profile:', err);
      notify(errorMessage(err, COULDNT), { tone: 'error' });
      setFailed(field);
      return false;
    }
  };

  // The last age / height saved or being saved: a blur and a leave never
  // send the same value twice (useFlushOnLeave).
  const savedAge = useRef(profile?.age ?? null);
  const saveAge = async () => {
    if (!plausibleAge(age) || Number(age) === Number(savedAge.current)) return;
    const before = savedAge.current;
    savedAge.current = Number(age);
    const ok = await saveProfile({ age: Number(age) });
    // The typed age stays; leaving the field again retries.
    if (!ok) savedAge.current = before;
  };

  const savedHeight = useRef(profile?.height || '');
  const typedHeight = useRef(null);
  const saveHeight = async (joined) => {
    if (!joined) return;
    if (parseHeightToInches(joined) === parseHeightToInches(savedHeight.current)) return;
    const before = savedHeight.current;
    savedHeight.current = joined;
    const ok = await saveProfile({ height: joined });
    if (!ok) savedHeight.current = before;
  };
  useFlushOnLeave(() => {
    saveAge();
    if (typedHeight.current) saveHeight(typedHeight.current);
  });

  return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
            Used to work out your calorie target.
          </Typography>
          <TextField
            fullWidth
            label="Age"
            type="number"
            value={age}
            onChange={(e) => { setAge(e.target.value); setFailed((f) => (f === 'age' ? null : f)); }}
            onBlur={saveAge}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            error={(age !== '' && !plausibleAge(age)) || failed === 'age'}
            helperText={age !== '' && !plausibleAge(age) ? 'An age from 13 to 110.' : failed === 'age' ? COULDNT : undefined}
            inputProps={{ inputMode: 'numeric' }}
          />
          <HeightField idPrefix="settings-height" value={profile.height || ''} onChange={(h) => { typedHeight.current = h; }} onBlur={saveHeight} helperText={failed === 'height' ? COULDNT : undefined} />
          <FormControl fullWidth error={failed === 'gender'}>
            <InputLabel id="settings-sex-label">Sex</InputLabel>
            <Select
              labelId="settings-sex-label"
              label="Sex"
              value={profile.gender || ''}
              onChange={(e) => saveProfile({ gender: e.target.value })}
            >
              {SEXES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
            {failed === 'gender' && <FormHelperText>{COULDNT}</FormHelperText>}
          </FormControl>
        </Box>
  );
}

const Settings = () => {
  const { themePreference, setThemePreference } = useAppTheme();
  const { user, logout } = useAuth() || {};
  const { notify } = useToast();

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [garminUsername, setGarminUsername] = useState('');
  const [garminUsernameSaved, setGarminUsernameSaved] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminSaving, setGarminSaving] = useState(false);
  const [garminError, setGarminError] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

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
      setGarminError(null);
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
      // Said under the button too; the email and password stay as typed.
      const message = errorMessage(err, 'Couldn’t save your Garmin login. Try again.');
      setGarminError(message);
      notify(message, { tone: 'error' });
    } finally {
      setGarminSaving(false);
    }
  };

  const themeSelect = (
    // 16px under the Larger text row (the spacing unit is 4px: 2.5 was 10px).
    <FormControl fullWidth sx={{ mt: 4 }}>
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

  const garminOn = Boolean(settings?.garmin?.enabled);
  const savedTarget = settings?.nutrition_goal?.enabled !== false ? Number(settings?.nutrition_goal?.daily_calorie_target) : 0;

  const garminLogin = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pt: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 4 }}>
        <TextField
          fullWidth
          label="Garmin email"
          type="email"
          autoComplete="username"
          value={garminUsername}
          onChange={(e) => setGarminUsername(e.target.value)}
          placeholder="your@email.com"
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
          helperText="Never stored in plain text"
        />
      </Box>
      {garminError && <Alert severity="error" data-testid="garmin-error">{garminError}</Alert>}
      <Button
        variant="contained"
        onClick={saveGarminLogin}
        disabled={garminSaving || !garminLoginChanged || !garminUsername.trim() || (!connected && !garminPassword)}
        startIcon={garminSaving ? <CircularProgress size={16} color="inherit" /> : null}
        sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
      >
        {garminSaving ? 'Saving…' : connected ? 'Update Garmin login' : 'Connect Garmin'}
      </Button>
    </Box>
  );

  // The watch: nothing but the switch until it is on; the login folded away
  // once it is connected; its sleep suggestion only while the watch is on.
  const watch = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 96 }}>
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
        <Box id="garmin">
          <FormControlLabel
            control={<Switch checked={garminOn} onChange={(e) => toggleGarmin(e.target.checked)} />}
            label={<RowWords title="Use my Garmin watch" body="Steps, sleep and heart rate from Garmin Connect." />}
            labelPlacement="start"
            // Switch on the right, as everywhere in Settings (A11).
            sx={SWITCH_ROW}
          />
          {garminOn && connected && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', wordBreak: 'break-word', mb: 2 }} data-testid="garmin-connected">
                {`Connected as ${garminUsernameSaved}`}
              </Typography>
              <Disclosure label="Change Garmin login" testId="garmin-login-toggle">{garminLogin}</Disclosure>
            </Box>
          )}
          {garminOn && !connected && garminLogin}
        </Box>

        {/* Health alerts — per-user opt-outs (settings.health_alerts, default
            on). It only ever speaks from watch data, so it is not shown to a
            person without the watch. */}
        {garminOn && (
          <Box id="health-alerts" sx={{ borderTop: (t) => `1px solid ${t.palette.divider}`, mt: connected ? 0 : 4, pt: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.health_alerts?.sleep_apnea_screening !== false}
                  onChange={(e) => saveSection('health_alerts', { ...(settings.health_alerts || {}), sleep_apnea_screening: e.target.checked })}
                />
              }
              label={(
                <RowWords
                  title="Sleep apnea screening suggestion"
                  body="Suggests a check when your watch records blood-oxygen dips overnight. Wrist readings are noisy, so turn this off if you’ve already talked to your doctor about them."
                />
              )}
              labelPlacement="start"
              sx={{ ...SWITCH_ROW, alignItems: 'flex-start', '& .MuiSwitch-root': { mt: 0.5 } }}
            />
          </Box>
        )}
      </>
    );
  };

  return (
    <Page narrow>
      {/* The top bar already says "Settings"; the page doesn't repeat it. */}
      <ExperienceSettings id="looks">{themeSelect}</ExperienceSettings>

      <AboutYou
        profile={profile}
        profileError={profileError}
        onRetryProfile={loadProfile}
        onProfileSaved={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
      />

      {/* The calorie plan has no row in the navigation; this is one way to it. */}
      <LabelPanel title="Calorie plan" titleComponent="h2" id="plans" data-testid="settings-plans">
        <LinkRow
          to="/calorie-wizard"
          title={savedTarget > 0 ? `${fmt(savedTarget)} calories a day` : 'Set a daily calorie target'}
          body={savedTarget > 0 ? 'See how it was worked out, or change it' : 'A few questions, then one number to eat to'}
          aria-label={savedTarget > 0 ? `Calorie plan: ${fmt(savedTarget)} calories a day` : 'Calorie plan: set a daily calorie target'}
        />
      </LabelPanel>

      {/* Household — once, here (it used to be on Profile too). */}
      <Box id="household">
        <HouseholdSettings />
      </Box>

      {/* Set up once, then left alone: last before Account. */}
      <LabelPanel title="Connected devices" titleComponent="h2" id="devices" data-testid="settings-devices">
        {watch()}
        <Box id="scans" sx={{ borderTop: (t) => `1px solid ${t.palette.divider}`, mt: 2, pt: 1 }}>
          <LinkRow to="/scan-import" title="Import a scan" body="Body scans from a smart scale" aria-label="Import a scan: body scans from a smart scale" />
        </Box>
      </LabelPanel>

      {/* Account */}
      <LabelPanel title="Account" titleComponent="h2" id="account">
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>Signed in as</Typography>
        <Typography sx={{ fontWeight: 600, wordBreak: 'break-word', mb: 4 }} data-testid="account-email">
          {profile?.email || user?.email || ''}
        </Typography>
        <Button variant="tonal" onClick={() => logout?.()} sx={{ minHeight: 44 }}>
          Sign out
        </Button>
      </LabelPanel>
    </Page>
  );
};

export default Settings;
