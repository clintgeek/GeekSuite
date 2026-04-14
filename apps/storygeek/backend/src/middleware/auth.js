import { attachUser } from '@geeksuite/user/server';

const basegeekUrl = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';

// Use the shared @geeksuite/user/server middleware
// This calls /api/users/me on baseGeek (not /auth/validate), normalizes user IDs,
// and sets req.user with _id, id, and userId fields.
export const authenticateToken = attachUser({ basegeekUrl });
