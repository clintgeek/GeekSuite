import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="story"
      appSuffix="geek"
      taglineLine1="Roll the dice."
      taglineLine2="Write the legend."
      description="AI-powered collaborative storytelling with DnD mechanics"
      features={['AI Game Master', 'Dice Mechanics', 'Character Tracking', 'Story Export']}
      onLogin={handleLogin}
      loading={loading}
      logoColor="#7c4dff"
      logoSuffixColor="#ff6d00"
    />
  );
}
