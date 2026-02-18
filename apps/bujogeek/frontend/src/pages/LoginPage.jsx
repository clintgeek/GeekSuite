import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const LoginPage = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="bujo"
      appSuffix="geek" // "bujogeek"
      taglineLine1="Journal calmly."
      taglineLine2="Plan effectively."
      description="The digital bullet journal for minimalists. Track the past, organize the present, and plan for the future."
      features={['Daily Log', 'Collections', 'Habit Tracking', 'Migration', 'Reflection']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // BujoGeek branding colors (Sage/Earth tones)
      logoColor="#4A8C6F" // Sage Green
      logoSuffixColor="#B87341" // Earthy Orange/Brown
      // Custom ink wash for BujoGeek (Greens/Earths)
      inkColors={[
        'rgba(74, 140, 111, 0.08)', // Sage
        'rgba(184, 115, 65, 0.06)'  // Earth
      ]}
    />
  );
};

export default LoginPage;