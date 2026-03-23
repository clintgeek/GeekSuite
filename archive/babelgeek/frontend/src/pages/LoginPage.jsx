import { LoginSplash } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';

const LoginPage = () => {
  const { login, loading, error } = useAuth();

  // BabelGeek login handling
  const handleLogin = async () => {
    await login();
  };

  return (
    <LoginSplash
      appName="babel"
      appSuffix="geek"
      taglineLine1="Speak freely."
      taglineLine2="Learn effortlessly."
      description="Master new languages with spaced repetition and AI-powered conversation practice."
      features={['Spaced Repetition', 'AI Conversations', 'Vocabulary Builder', 'Pronunciation Check']}
      onLogin={handleLogin}
      loading={loading}
      error={error}
      // BabelGeek branding (Cyan/Teal)
      logoColor="#0891b2" // Cyan 600
      logoSuffixColor="#06b6d4" // Cyan 500
      // Custom ink wash for BabelGeek
      inkColors={[
        'rgba(6, 182, 212, 0.08)', // Cyan
        'rgba(14, 165, 233, 0.06)'  // Sky
      ]}
    />
  );
};

export default LoginPage;
