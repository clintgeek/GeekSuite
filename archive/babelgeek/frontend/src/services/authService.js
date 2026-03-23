/**
 * Auth Service for BabelGeek
 *
 * Uses baseGeek for centralized SSO authentication
 */

import { getMe, loginRedirect, logout as logoutRequest } from "@geeksuite/auth";

const APP_NAME = "babelgeek";

/**
 * Auth service using baseGeek SSO
 */
export const authService = {
  /**
   * Register a new user
   */
  async register(userData) {
    loginRedirect(APP_NAME, window.location.href, "register");
    return { user: null, token: null, refreshToken: null, app: APP_NAME };
  },

  /**
   * Login user
   */
  async login(credentials) {
    loginRedirect(APP_NAME, window.location.href, "login");
    return { user: null, token: null, refreshToken: null, app: APP_NAME };
  },

  /**
   * Get current user profile
   */
  async getCurrentUser() {
    return getMe();
  },

  /**
   * Logout user
   */
  logout() {
    logoutRequest();
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return false;
  },

  /**
   * Refresh the access token
   */
  async refreshToken() {
    throw new Error("Token refresh is not supported in cookie-first SSO mode");
  },

  /**
   * Get the current token
   */
  getToken() {
    return null;
  },
};

export default authService;
