import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const LoginPage = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="flock"
      appSuffix="geek"
      taglineLine1="Keep track."
      taglineLine2="Happy flock."
      description="The ultimate chicken keeping companion. Track egg production, monitor health, and manage your flock with ease."
      features={['Egg Logs', 'Health Records', 'Flock Management', 'Production Stats']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // FlockGeek branding (Amber/Gold/Red) - Rooster colors
      // Theme tokens, not hex: the wordmark follows the app's own palette in
      // both modes, and that palette is what the contrast suite checks.
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // Custom ink wash for FlockGeek
      inkColors={[
        'rgba(217, 119, 6, 0.08)', // Amber
        'rgba(180, 83, 9, 0.06)'   // Darker Amber
      ]}
    />
  );
};

export default LoginPage;
