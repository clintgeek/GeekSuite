import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const Login = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="fitness"
      appSuffix="geek"
      taglineLine1="Train smarter."
      taglineLine2="Live stronger."
      description="Your personal command center for health tracking, workout analytics, and nutrition planning."
      features={['Workout Logs', 'Nutrition Tracking', 'Progress Charts', 'Body Metrics']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // FitnessGeek branding (Blue/Energy)
      logoColor="#2563eb" // Blue 600
      logoSuffixColor="#3b82f6" // Blue 500
      // Custom ink wash for FitnessGeek
      inkColors={[
        'rgba(37, 99, 235, 0.08)', // Blue
        'rgba(59, 130, 246, 0.06)'  // Lighter Blue
      ]}
    />
  );
};

export default Login;