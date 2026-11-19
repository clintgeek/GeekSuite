/**
 * The sign-in page — the first thing a new device sees, so it says what
 * TodoGeek is today (DOCS/SIMPLE_PLAN.md): four views and one add box that
 * reads what you type. The BuJoGeek feature list (Daily Log, Habits,
 * Migration, Reflection) and its sage-green wash retired on 2026-09-29.
 *
 * Red Pen: paper, a faint wash of ink and one of red, both read off the app
 * theme (`penOf`), so night mode follows without a second list of colours.
 */
import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';
import { alpha, useTheme } from '@mui/material/styles';
import { penOf } from '../theme/pen';

export const LOGIN_COPY = {
  taglineLine1: 'Write it down.',
  taglineLine2: 'Cross it off.',
  description:
    'One list for today. Type “dentist friday 3pm #home” and it lands on Friday at 3pm, tagged. Tick it and it is crossed off.',
  features: ['Today', 'Upcoming', 'Done', 'Search', 'An add box that reads what you type'],
};

const LoginPage = () => {
  const { login, loading, error } = useAuth();
  const theme = useTheme();
  const p = penOf(theme);

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="todo"
      appSuffix="geek" // "todogeek"
      taglineLine1={LOGIN_COPY.taglineLine1}
      taglineLine2={LOGIN_COPY.taglineLine2}
      description={LOGIN_COPY.description}
      features={LOGIN_COPY.features}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // Theme tokens, not hex: the wordmark follows the app's own palette in
      // both modes, and that palette is what the contrast suite checks.
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // Paper with a breath of ink and one of red — never a colour of its own.
      inkColors={[alpha(p.ink, 0.05), alpha(p.red, 0.05)]}
    />
  );
};

export default LoginPage;
