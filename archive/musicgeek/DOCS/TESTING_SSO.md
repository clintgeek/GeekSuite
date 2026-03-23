# Testing MusicGeek SSO Integration

## Prerequisites

Before running the SSO integration test, you need:

1. **BaseGeek must be running** at `https://basegeek.clintgeek.com` (or update `BASEGEEK_URL` in `.env`)

2. **A valid test user in BaseGeek**:
   - You need a user already registered in BaseGeek
   - The user must have access to the `musicgeek` app
   - Update the test credentials in `test-sso-integration.js`

3. **MusicGeek backend must be running**:
   ```bash
   cd /Users/ccrocker/projects/MusicGeek/backend
   npm start
   ```

## Creating a Test User

⚠️ **Important**: There's currently a bug in BaseGeek's registration endpoint (fixed in code but not deployed). Use an existing BaseGeek user for testing or wait for the BaseGeek deployment.

### Option 1: Use Existing BaseGeek User

If you already have a BaseGeek account, use those credentials for testing.

### Option 2: Register via BaseGeek UI (Recommended)

1. Go to `https://basegeek.clintgeek.com`
2. Register a new user through the UI
3. Note the email/password for testing

### Option 3: Register via API (After BaseGeek Fix is Deployed)

```bash
curl -X POST https://basegeek.clintgeek.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePass123!",
    "app": "musicgeek"
  }'
```

**Note**: BaseGeek registration fix is in `/Users/ccrocker/projects/baseGeek/packages/api/src/routes/auth.js` - the fix changes `password` to `passwordHash` when creating the User model.

## Running the Test

1. **Update test credentials** in `test-sso-integration.js`:

   ```javascript
   const loginResponse = await axios.post(`${MUSICGEEK_API}/api/auth/login`, {
     email: 'your-test-user@example.com', // Your test user email
     password: 'your-password', // Your test user password
     app: 'musicgeek',
   });
   ```

2. **Start the MusicGeek backend**:

   ```bash
   cd /Users/ccrocker/projects/MusicGeek/backend
   npm start
   ```

3. **Run the test** (in a new terminal):
   ```bash
   cd /Users/ccrocker/projects/MusicGeek/backend
   node test-sso-integration.js
   ```

## Expected Output

If everything is configured correctly:

```
🎸 Testing MusicGeek SSO Integration with BaseGeek

1️⃣  Testing login via MusicGeek backend...
✅ Login successful!
   User: test@example.com
   App: musicgeek
   Token: eyJhbGciOiJIUzI1NiIs...
   Refresh Token: eyJhbGciOiJIUzI1NiIs...

2️⃣  Testing token verification (GET /me)...
✅ Token verified!
   Profile: {
     "user": {
       "id": "user-id",
       "email": "test@example.com",
       "username": "testuser",
       "profile": { ... }
     }
   }

3️⃣  Testing token refresh...
✅ Token refresh successful!
   New Token: eyJhbGciOiJIUzI1NiIs...
   New Refresh Token: eyJhbGciOiJIUzI1NiIs...

4️⃣  Testing protected endpoint access...
✅ Protected endpoint accessible!
   User data: { ... }

5️⃣  Testing logout...
✅ Logout successful!
   Message: Logout successful

🎉 All SSO integration tests passed!
```

## Troubleshooting

### "Invalid app" Error

- **Cause**: The app name is not recognized by BaseGeek
- **Solution**: Verify `musicgeek` is in the allowed apps list in BaseGeek
- Check: `baseGeek/packages/api/src/routes/auth.js`

### "Invalid credentials" Error (401)

- **Cause**: Email/password don't match any user in BaseGeek
- **Solution**:
  1. Create a test user (see above)
  2. Update test credentials
  3. Verify user exists in BaseGeek database

### "Too many login attempts" Error (429)

- **Cause**: Rate limit exceeded (5 attempts in 15 minutes)
- **Solution**: Wait 15 minutes or use different credentials

### "Connection refused" Error

- **Cause**: MusicGeek backend not running
- **Solution**: Start the backend with `npm start`

### "Token verification failed"

- **Cause**: JWT_SECRET mismatch between BaseGeek and MusicGeek
- **Solution**:
  1. Check `.env` file: `JWT_SECRET` must match BaseGeek exactly
  2. Current value should be: `CHANGE_ME_SET_JWT_SECRET`
  3. Restart backend after changing `.env`

### BaseGeek Not Responding

- **Cause**: BaseGeek is down or unreachable
- **Solution**:
  1. Verify BaseGeek URL: `https://basegeek.clintgeek.com`
  2. Test BaseGeek directly: `curl https://basegeek.clintgeek.com/health`
  3. Check network connectivity
  4. For local testing, start BaseGeek locally and update `BASEGEEK_URL`

## Manual Testing Without Script

### 1. Test Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'
```

### 2. Test Token Verification (use token from login response)

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Test Token Refresh

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

### 4. Test Logout

```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Integration Test Checklist

Before reporting issues, verify:

- [ ] BaseGeek is running and accessible
- [ ] MusicGeek backend is running (port 3001)
- [ ] MongoDB is running and accessible
- [ ] Test user exists in BaseGeek
- [ ] Test credentials are correct in test file
- [ ] JWT_SECRET matches between BaseGeek and MusicGeek
- [ ] `.env` file is properly loaded
- [ ] No firewall blocking connections
- [ ] Correct BASEGEEK_URL in `.env`

## Next Steps After Successful Tests

Once integration tests pass:

1. **Frontend Integration**
   - Update frontend auth service to use MusicGeek backend endpoints
   - Implement token storage (localStorage or cookies)
   - Add token refresh logic
   - Handle authentication errors

2. **Production Deployment**
   - Use HTTPS for all auth endpoints
   - Update BASEGEEK_URL for production
   - Configure proper CORS settings
   - Enable rate limiting
   - Set up monitoring and logging

3. **Security Hardening**
   - Use httpOnly cookies for refresh tokens
   - Implement CSRF protection
   - Add request signing
   - Enable audit logging
   - Regular security audits
