import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const LoginPage = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="music"
      appSuffix="geek"
      taglineLine1="Play daily."
      taglineLine2="Master rhythm."
      description="Interactive tools for musicians. Metronomes, tuners, and practice logs to help you master your craft."
      features={['Smart Metronome', 'Tuners', 'Practice Logs', 'Progress Tracking']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // MusicGeek branding (Violet/Purple)
      logoColor="#7c3aed" // Violet 600
      logoSuffixColor="#8b5cf6" // Violet 500
      // Custom ink wash for MusicGeek
      inkColors={[
        'rgba(124, 58, 237, 0.08)', // Violet
        'rgba(139, 92, 246, 0.06)'  // Lighter Violet
      ]}
    />
  );
};

export default LoginPage;
