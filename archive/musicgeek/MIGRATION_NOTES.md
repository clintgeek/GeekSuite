# MongoDB Migration - Important Notes

## Authentication Token Issue

After migrating from PostgreSQL to MongoDB, **all existing JWT tokens are invalid** because they contain PostgreSQL UUIDs instead of MongoDB ObjectIds.

### Solution

**You must log out and log back in** to get a new JWT token with the correct MongoDB ObjectId.

### Steps:

1. Click "Logout" in the application
2. Log back in with your credentials
3. The application should now work correctly

### Technical Details

- **Old tokens**: Contain PostgreSQL UUIDs like `b3a00cb0-8468-4592-8b59-80f333d5d9f2`
- **New tokens**: Will contain MongoDB ObjectIds like `69210cf9099a9bb97d1a0f35`
- The migration script successfully migrated all user data, but cannot update existing JWT tokens (they're stateless and stored client-side)

### Error Messages You Might See

If you see errors like:

```
Cast to ObjectId failed for value "b3a00cb0-8468-4592-8b59-80f333d5d9f2"
```

This means you're still using an old JWT token. Simply log out and log back in to resolve this.
