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
      // FitnessGeek branding: Market Morning's basil and lemon
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // A warm wash: basil and the lemon of the morning light
      inkColors={[
        'rgba(47, 107, 53, 0.08)', // Basil
        'rgba(246, 201, 69, 0.10)'  // Lemon
      ]}
    />
  );
};

export default Login;