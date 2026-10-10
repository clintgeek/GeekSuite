import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const LoginPage = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="todo"
      appSuffix="geek" // "todogeek"
      taglineLine1="Journal calmly."
      taglineLine2="Plan effectively."
      description="Tasks, habits & lists for minimalists. Clear the past, work the present, plan ahead."
      features={['Daily Log', 'Collections', 'Habit Tracking', 'Migration', 'Reflection']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // TodoGeek branding colors (Sage/Earth tones)
      // Theme tokens, not hex: the wordmark follows the app's own palette in
      // both modes, and that palette is what the contrast suite checks.
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // Custom ink wash for TodoGeek (Greens/Earths)
      inkColors={[
        'rgba(74, 140, 111, 0.08)', // Sage
        'rgba(184, 115, 65, 0.06)'  // Earth
      ]}
    />
  );
};

export default LoginPage;