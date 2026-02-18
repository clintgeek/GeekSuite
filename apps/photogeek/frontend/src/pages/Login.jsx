import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const Login = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="photo"
      appSuffix="geek"
      taglineLine1="Capture light."
      taglineLine2="Organize life."
      description="A professional workflow for photographers. Manage shoots, track gear, and deliver stunning galleries."
      features={['Shoot Planning', 'Gear Tracking', 'Client Galleries', 'Location Scouting']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // PhotoGeek branding (Rose/Pink)
      logoColor="#e11d48" // Rose 600
      logoSuffixColor="#f43f5e" // Rose 500
      // Custom ink wash for PhotoGeek
      inkColors={[
        'rgba(225, 29, 72, 0.08)', // Rose
        'rgba(244, 63, 94, 0.06)'   // Lighter Rose
      ]}
    />
  );
};

export default Login;
