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
      description="What you eat, your weight and your blood pressure, all in one place."
      features={['Food log', 'Weight', 'Blood pressure', 'Medications']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // FitnessGeek branding (Blue/Energy)
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // Custom ink wash for FitnessGeek
      inkColors={[
        'rgba(37, 99, 235, 0.08)', // Blue
        'rgba(59, 130, 246, 0.06)'  // Lighter Blue
      ]}
    />
  );
};

export default Login;