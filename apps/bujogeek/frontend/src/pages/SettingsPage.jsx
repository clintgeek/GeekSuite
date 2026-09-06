/**
 * BuJoGeek settings — minimal by design.
 *
 * The shell grammar requires a Settings destination on both the sidebar
 * footer and the top bar account menu; BuJoGeek had neither a route nor a
 * page. This is the smallest honest version: read-only account details, the
 * suite theme preference, the reminders toggle (a per-browser global
 * preference, so it belongs here too, not just in the sidebar), the AI review
 * draft opt-in, and sign out.
 *
 * Three different stores are on this page and they are not interchangeable:
 * theme is the suite-wide `preferences` bag, reminders are a browser
 * permission plus a push subscription, and Assistance is bujogeek's own
 * per-app preference (`useBujoPreferences` → `User.appPreferences.bujogeek`).
 * An app-specific setting the gateway also reads belongs in the last one.
 */
import {
  Avatar,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { LogOut, Bell, BellOff } from 'lucide-react';
import { useThemeMode } from '@geeksuite/user';
import { useAuth } from '../context/AuthContext';
import usePushReminders from '../hooks/usePushReminders';
import useBujoPreferences from '../hooks/useBujoPreferences';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'System' },
];

const SectionHeading = ({ children }) => (
  <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
    {children}
  </Typography>
);

const RemindersRow = () => {
  const { status, busy, toggle } = usePushReminders();

  if (status === 'loading') return null;

  if (status === 'unsupported') {
    return (
      <Typography variant="body2" color="text.muted">
        Reminders aren&rsquo;t available in this browser.
      </Typography>
    );
  }

  const on = status === 'on';
  const denied = status === 'denied';
  const Icon = on ? Bell : BellOff;

  return (
    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Icon size={18} strokeWidth={1.75} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {on ? 'Reminders on' : denied ? 'Reminders blocked' : 'Reminders off'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {denied
              ? 'Notifications are blocked for this site — allow them in your browser settings.'
              : 'Get a notification when a task with a due time comes up.'}
          </Typography>
        </Box>
      </Stack>
      <Button
        variant="outlined"
        size="small"
        disabled={denied || busy}
        onClick={toggle}
      >
        {on ? 'Turn off' : 'Turn on'}
      </Button>
    </Stack>
  );
};

/**
 * The one AI opt-in bujogeek has. Default OFF, and off is enforced on the
 * gateway too — the `reviewDraft` resolver reads this same preference, so a
 * client that forgot to check it still cannot spend a model call.
 */
const AiReviewDraftRow = () => {
  const { aiReviewDraft, setAiReviewDraft, loading } = useBujoPreferences();

  return (
    <>
      <FormControlLabel
        control={
          <Switch
            checked={aiReviewDraft}
            disabled={loading}
            onChange={(event) => setAiReviewDraft(event.target.checked)}
            inputProps={{ 'aria-describedby': 'bujo-ai-review-draft-help' }}
          />
        }
        label="AI review draft"
        sx={{ ml: 0, minHeight: 44, '& .MuiFormControlLabel-label': { fontWeight: 600 } }}
      />
      <Typography
        id="bujo-ai-review-draft-help"
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5 }}
      >
        On the Weekly Review, offer to write up the week from your own counts, streaks and open
        tasks. It never saves anything — you edit and save the review yourself, and it is marked
        AI-drafted. Off by default; with it off you still get a plain summary built without a model.
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.muted' }}>
        Task titles, collection names, habit names and the week&rsquo;s counts are sent. Notes,
        tags and task bodies are not.
      </Typography>
    </>
  );
};

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { themePreference, setThemePreference } = useThemeMode();

  return (
    <Box sx={{ maxWidth: 640, p: { xs: 2, sm: 3, md: 4 } }}>
      <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
        Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Account details and appearance for this device and every GeekSuite app.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Account</SectionHeading>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ width: 44, height: 44, bgcolor: 'primary.main' }}>
            {initialsFrom(user)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
              {displayNameFrom(user)}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {secondaryFrom(user) || 'No email on file'}
            </Typography>
          </Box>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.muted' }}>
          Managed by your GeekSuite account.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Appearance</SectionHeading>
        <FormControl fullWidth>
          <InputLabel id="bujo-theme-label">Theme</InputLabel>
          <Select
            labelId="bujo-theme-label"
            label="Theme"
            value={themePreference ?? 'auto'}
            onChange={(event) => setThemePreference(event.target.value)}
          >
            {themeOptions.map(({ value, label }) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.muted' }}>
          Shared with the rest of GeekSuite. &ldquo;System&rdquo; follows your device setting.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Reminders</SectionHeading>
        <RemindersRow />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Assistance</SectionHeading>
        <AiReviewDraftRow />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <SectionHeading>Session</SectionHeading>
        <Divider sx={{ mb: 2 }} />
        <Button variant="outlined" color="error" startIcon={<LogOut size={18} />} onClick={logout}>
          Sign out
        </Button>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
