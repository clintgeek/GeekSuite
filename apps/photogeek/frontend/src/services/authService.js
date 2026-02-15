import { getMe as getMeFromCookie, loginRedirect } from '@geeksuite/auth';

/**
 * Register new user
 */
const register = async () => {
  loginRedirect('photogeek', window.location.href, 'register');
  return null;
};

/**
 * Login user
 */
const login = async () => {
  loginRedirect('photogeek', window.location.href, 'login');
  return null;
};

/**
 * Logout user
 */
const logout = () => {
  // Logout is handled by AuthContext via authClient.logout()
};

/**
 * Get current user
 */
const getCurrentUser = () => null;

/**
 * Get user profile from API
 */
const getMe = async () => getMeFromCookie();

const authService = {
  register,
  login,
  logout,
  getCurrentUser,
  getMe,
};

export default authService;
