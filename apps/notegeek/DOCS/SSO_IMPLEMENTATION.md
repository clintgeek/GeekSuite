# NoteGeek SSO Implementation Guide

## Overview

This document provides detailed instructions for implementing Single Sign-On (SSO) between GeekBase (identity provider) and NoteGeek (client application). The implementation allows users to authenticate once in GeekBase and access NoteGeek without re-entering credentials.

## Configuration Requirements

### 1. Environment Variables

#### GeekBase (Identity Provider)
```env
# JWT Configuration
JWT_SECRET=your-secure-secret-key
JWT_REFRESH_SECRET=your-secure-refresh-secret-key
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
```

#### NoteGeek (Client Application)
```env
# API URL
VITE_API_URL=http://localhost:5001/api

# GeekBase SSO URL (replace with actual URL in production)
VITE_BASE_GEEK_URL=http://localhost:3000
```

## Implementation Details

### 1. GeekBase Updates

1. **Shared Auth Store**
   - Updated to handle refresh tokens
   - Added token management for cross-app auth
   - Added error handling for token validation and refresh

2. **Auth Callback Component**
   - Updated to process refresh tokens
   - Added support for redirect handling
   - Improved error handling

3. **Auth Service**
   - Consistent token generation (access + refresh)
   - App-specific token claims
   - Standardized response format

### 2. NoteGeek Updates

1. **Auth Store**
   - Added SSO integration functions
   - Implemented token refresh mechanism
   - Added toggle for SSO vs direct auth

2. **Auth Callback Component**
   - Created to handle SSO redirects
   - Added CSRF protection with state parameter
   - Implemented token storage

3. **Login Component**
   - Added GeekBase SSO login button
   - Added toggle for SSO/direct login
   - Improved user experience for both auth paths

4. **App Routes**
   - Added /auth/callback route

## Authentication Flow

1. **Initial Login**
   - User visits NoteGeek login page
   - User clicks "Login with GeekBase"
   - System generates state parameter for CSRF protection
   - User is redirected to GeekBase login
   - After authentication, GeekBase redirects to NoteGeek callback URL with tokens
   - NoteGeek validates tokens and redirects to the app

2. **Token Refresh**
   - When the access token expires, NoteGeek uses the refresh token
   - System calls GeekBase's refresh endpoint
   - New tokens are issued and stored
   - User session continues seamlessly

## Security Considerations

1. **CSRF Protection**
   - State parameter for verifying redirect authenticity
   - Validation on callback to prevent CSRF attacks

2. **Token Security**
   - Short-lived access tokens (1 hour)
   - Longer-lived refresh tokens (7 days)
   - Secure token storage
   - Proper token validation

3. **Environment Security**
   - Secrets stored in environment variables
   - Different secrets for access and refresh tokens
   - No hardcoded keys in the codebase

## Local Development Setup

1. Start GeekBase:
```bash
cd baseGeek
npm install
npm run dev
```

2. Start NoteGeek:
```bash
cd NoteGeek
npm install
npm run dev
```

3. Configure environment variables as described above

4. Test the SSO flow by navigating to NoteGeek login and using the GeekBase SSO option

## Troubleshooting

### Common Issues

1. **"Invalid state parameter"**
   - The state parameter didn't match or is missing
   - Check sessionStorage handling in the callback component
   - Verify CSRF protection implementation

2. **"Token refresh failed"**
   - Check if refresh token is present and valid
   - Verify the GeekBase refresh endpoint is accessible
   - Check JWT_REFRESH_SECRET in the GeekBase environment

3. **"No token found in callback URL"**
   - Inspect the redirect URL from GeekBase
   - Verify GeekBase is including token and refreshToken in the callback URL
   - Check GeekBase auth controller for proper token inclusion

4. **Missing user data after login**
   - Verify the token contains necessary user information
   - Check token decoding in the NoteGeek auth store
   - Verify user fields in the token payload

## Future Improvements

1. **Silent Authentication**
   - Implement iframe-based silent auth
   - Automatic background token refresh

2. **Enhanced User Experience**
   - Persistent login preferences
   - Better loading states during SSO redirect

3. **Advanced Security**
   - Token encryption
   - Rate limiting
   - Enhanced logging

4. **Multi-Factor Authentication**
   - Support for MFA via GeekBase
   - Step-up authentication for sensitive operations