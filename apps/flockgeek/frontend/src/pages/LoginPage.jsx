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
      logoColor="#d97706" // Amber 600
      logoSuffixColor="#b45309" // Amber 700
      // Custom ink wash for FlockGeek
      inkColors={[
        'rgba(217, 119, 6, 0.08)', // Amber
        'rgba(180, 83, 9, 0.06)'   // Darker Amber
      ]}
    />
  );
};

export default LoginPage;
