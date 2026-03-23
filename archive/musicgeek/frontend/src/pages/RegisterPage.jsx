import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register, error, isAuthenticated, isLoading } = useAuth();
  const APP_NAME = import.meta.env.VITE_APP_NAME || 'musicgeek';

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <h1>Join MusicGeek</h1>
        <p className="subtitle">Create your baseGeek account to use {APP_NAME}</p>

        {error && <div className="error-message">{error}</div>}

        <button type="button" className="btn-primary" onClick={() => register()}>
          Create account
        </button>

        <p className="login-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
