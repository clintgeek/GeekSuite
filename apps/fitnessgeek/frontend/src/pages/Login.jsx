import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';
import { useTheme, alpha } from '@mui/material/styles';

const Login = () => {
  const { login, loading, error } = useAuth();
  const theme = useTheme();

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
      // FitnessGeek branding: ink and blue
      logoColor="text.primary"
      logoSuffixColor="primary.main"
      // A cool wash: blue and a trace of ink, from theme tokens
      // so night mode gets its own blue
      inkColors={[
        alpha(theme.palette.primary.main, 0.1),
        alpha(theme.palette.text.primary, 0.05),
      ]}
    />
  );
};

export default Login;