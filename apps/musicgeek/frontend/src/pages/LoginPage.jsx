import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, error, isAuthenticated, isLoading } = useAuth();
  const APP_NAME = import.meta.env.VITE_APP_NAME || 'musicgeek';

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Welcome Back</h1>
        <p className="subtitle">Sign in with your baseGeek account to access {APP_NAME}</p>

        {error && <div className="error-message">{error}</div>}

        <button type="button" className="btn-primary" onClick={() => login()}>
          Sign in
        </button>

        <p className="register-link">
          Don’t have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
