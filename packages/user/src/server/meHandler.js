'use strict';

/**
 * Express route handler for GET /api/me.
 *
 * Returns the merged SSO identity + local user data.
 * Assumes attachUser() middleware has already run.
 *
 * Options:
 *   transform – (merged, req) => object – post-process the response before sending
 */
function meHandler(options = {}) {
  const { transform } = options;

  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (!req.geek?.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const ssoUser = req.geek.user;
    const localUser = req.geek.localUser;

    let merged = { ...ssoUser };

    if (localUser) {
      const localObj = localUser.toObject ? localUser.toObject() : localUser;
      // Spread local fields but don't overwrite SSO identity fields
      const { _id, userId, email, __v, createdAt, updatedAt, ...localFields } = localObj;
      merged = {
        ...merged,
        localId: _id,
        ...localFields,
      };
    }

    if (transform) {
      merged = transform(merged, req);
    }

    return res.json({ user: merged });
  };
}

module.exports = { meHandler };
