# BaseGeek SSO Integration Guide

## Overview

MusicGeek (formerly GuitarGeek) uses **BaseGeek** for centralized user authentication and database management. This document explains how the integration works and how to configure it.

## Architecture

```
Frontend → MusicGeek Backend → BaseGeek
           ↓
     MongoDB (app-specific data)
```

### Data Flow

1. **Authentication Flow:**
   - User submits login/register request to MusicGeek backend
   - MusicGeek backend forwards request to BaseGeek
   - BaseGeek validates credentials and returns JWT tokens
   - MusicGeek backend creates/updates local UserProfile
   - Tokens and user data returned to frontend

2. **Authorization Flow:**
   - Frontend includes JWT token in Authorization header
   - MusicGeek middleware verifies token using shared JWT_SECRET
   - User information extracted from token
   - Request proceeds with authenticated user context

## Configuration

### Required Environment Variables

```bash
# JWT Configuration - MUST match BaseGeek's JWT_SECRET
JWT_SECRET=CHANGE_ME_SET_JWT_SECRET
JWT_REFRESH_SECRET=CHANGE_ME_SET_JWT_REFRESH_SECRET

# BaseGeek SSO Integration
BASEGEEK_URL=https://basegeek.clintgeek.com

# MongoDB for app-specific data
MONGO_URI=mongodb://localhost:27017/musicGeek?authSource=admin
```

### Critical: JWT Secret

⚠️ **The `JWT_SECRET` MUST match BaseGeek's secret exactly** or token verification will fail.

This shared secret allows MusicGeek to verify tokens issued by BaseGeek without making an API call.

## API Endpoints

### Authentication Endpoints

#### POST `/api/auth/register`

Register a new user via BaseGeek.

**Request:**

```json
{
  "username": "user123",
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "user123",
      "app": "musicgeek",
      "profile": {
        "userId": "user-id",
        "displayName": "user123",
        "instruments": []
      }
    }
  },
  "timestamp": "2025-11-21T10:30:00.000Z"
}
```

#### POST `/api/auth/login`

Login via BaseGeek.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Same format as register.

**Error Responses:**

- `401`: Invalid credentials
- `429`: Too many login attempts (rate limited)
- `500`: Server error

#### POST `/api/auth/refresh`

Refresh access token using refresh token.

**Request:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "new-access-token",
    "refreshToken": "new-refresh-token",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "user123",
      "app": "musicgeek"
    }
  },
  "timestamp": "2025-11-21T10:35:00.000Z"
}
```

#### GET `/api/auth/me`

Get current user profile (requires authentication).

**Headers:**

```
Authorization: Bearer {token}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "username": "user123",
      "profile": {
        "userId": "user-id",
        "displayName": "user123",
        "instruments": ["guitar", "bass"]
      }
    }
  },
  "timestamp": "2025-11-21T10:30:00.000Z"
}
```

#### POST `/api/auth/logout`

Logout user (requires authentication).

**Response:**

```json
{
  "success": true,
  "message": "Logout successful",
  "timestamp": "2025-11-21T10:30:00.000Z"
}
```

#### POST `/api/auth/validate-sso`

Validate an SSO token from BaseGeek.

**Request:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** Same format as login.

## Token Management

### Access Token

- Short-lived (typically 1 hour)
- Used for API authentication
- Stored in frontend as `authToken` or `geek_token`

### Refresh Token

- Long-lived (typically 7 days)
- Used to obtain new access tokens
- Stored securely in frontend

### Token Storage (Frontend)

```javascript
// Store tokens after login
localStorage.setItem('authToken', token);
localStorage.setItem('refreshToken', refreshToken);

// Include in API requests
headers: {
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`
}

// Refresh when access token expires
const response = await axios.post('/api/auth/refresh', {
  refreshToken: localStorage.getItem('refreshToken')
});
```

## Database Schema

### UserProfile (MongoDB)

MusicGeek stores app-specific user data in its own MongoDB database:

```javascript
{
  userId: String,        // BaseGeek user ID (reference)
  email: String,
  displayName: String,
  instruments: [String], // User's instruments
  skillLevel: String,
  preferences: Object,
  createdAt: Date,
  updatedAt: Date
}
```

**Key Point:** User authentication data lives in BaseGeek; app-specific data lives in MusicGeek's MongoDB.

## Implementation Details

### Backend Components

#### 1. Auth Controller (`src/controllers/authController.js`)

- Proxies auth requests to BaseGeek
- Creates/updates local UserProfile
- Handles token refresh
- Provides SSO validation

#### 2. Auth Middleware (`src/middleware/auth.js`)

- Verifies JWT tokens using shared secret
- Attaches user info to request object
- Handles token expiration
- Provides optional auth for public endpoints

#### 3. Config (`src/config/config.js`)

- Loads JWT_SECRET from environment
- Configures BaseGeek URL
- Centralizes configuration

### Logging

All authentication operations are logged with Winston:

- Login/register attempts
- Token verification
- Profile creation
- Errors and warnings

View logs in `logs/combined.log` and `logs/error.log`.

## Testing

### Integration Test

Run the SSO integration test:

```bash
cd backend
node test-sso-integration.js
```

This tests:

1. Login via MusicGeek backend
2. Token verification
3. Token refresh
4. Protected endpoint access
5. Logout

### Manual Testing with curl

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get profile
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Refresh token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

## Comparison with Other Apps

### FitnessGeek Pattern (Fully Integrated)

- ✅ All auth through BaseGeek
- ✅ Refresh token support
- ✅ Rate limiting awareness
- ✅ Comprehensive error handling
- ✅ Token refresh endpoint

### MusicGeek (Now Matches FitnessGeek)

- ✅ All auth through BaseGeek
- ✅ Refresh token support
- ✅ Rate limiting awareness
- ✅ Comprehensive error handling
- ✅ Token refresh endpoint
- ✅ Improved logging with Winston

### NoteGeek (Minimal Integration)

- ⚠️ Has BaseGeek URL configured
- ❌ Still uses local bcrypt auth
- ❌ Not fully integrated

### BuJoGeek (No Integration)

- ❌ Self-contained authentication
- ❌ Own MongoDB for users
- ❌ No BaseGeek integration

## Troubleshooting

### "Invalid token" errors

1. Verify `JWT_SECRET` matches BaseGeek exactly
2. Check token hasn't expired
3. Ensure token format is `Bearer {token}`

### "Too many login attempts"

- BaseGeek rate limits login attempts
- Wait 15 minutes or use different credentials

### "User profile not found"

- Profile created automatically on first auth
- Check MongoDB connection
- Verify UserProfile model is correct

### Token verification fails

1. Check `JWT_SECRET` in `.env`
2. Restart backend after .env changes
3. Verify token is from BaseGeek (not another source)

## Security Considerations

1. **Never log JWT secrets** - Use `logger.debug` for token info, not the secret
2. **Use HTTPS in production** - Tokens should never be sent over HTTP
3. **Validate all inputs** - Use validation middleware on all auth endpoints
4. **Rate limit auth endpoints** - BaseGeek handles this, but consider additional limits
5. **Rotate secrets regularly** - Coordinate with BaseGeek admin
6. **Store refresh tokens securely** - Consider httpOnly cookies in production

## Future Enhancements

- [ ] Add email verification flow
- [ ] Implement password reset via BaseGeek
- [ ] Add 2FA support
- [ ] Implement session management
- [ ] Add OAuth providers (Google, GitHub)
- [ ] Add user role management
- [ ] Implement audit logging

## Support

For issues with:

- **BaseGeek API**: Contact BaseGeek admin
- **MusicGeek integration**: Check this documentation or logs
- **Token issues**: Verify JWT_SECRET matches BaseGeek

## References

- [BaseGeek Documentation](../baseGeek/README.md)
- [FitnessGeek Integration](../../fitnessGeek/DOCS/BASEGEEK_INTEGRATION.md)
- [JWT.io](https://jwt.io) - JWT debugger
