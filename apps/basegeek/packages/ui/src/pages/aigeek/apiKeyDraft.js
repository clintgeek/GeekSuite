/**
 * The shape of an API-key draft, and the permission roster behind it.
 *
 * Separate from `dialogs/APIKeyDialog.jsx` because both the hook (which fills
 * a draft and posts it) and the dialog (which renders one) need these, and a
 * module that exports a component plus helpers is a fast-refresh boundary the
 * lint config warns about — for good reason: editing this table should not
 * blow away a half-filled form.
 */

/** Mirrors the `permissions` validator on `models/APIKey.js`, with human labels. */
export const AVAILABLE_PERMISSIONS = [
  { value: 'ai:call', label: 'AI Calls', description: 'Make AI API calls' },
  { value: 'ai:models', label: 'Models', description: 'Access model information' },
  { value: 'ai:providers', label: 'Providers', description: 'Access provider information' },
  { value: 'ai:stats', label: 'Statistics', description: 'View AI usage statistics' },
  { value: 'ai:director', label: 'Director', description: 'Access AI Director features' },
  { value: 'ai:usage', label: 'Usage', description: 'View usage analytics' },
];

/**
 * A fresh key for `appName`. The rate limits repeat the model's own defaults
 * so the boxes are never blank — an admin should be able to see what they are
 * about to accept without saving first to find out.
 */
export const emptyKeyDraft = (appName = '') => ({
  mode: 'create',
  id: null,
  name: '',
  appName,
  description: '',
  permissions: ['ai:call', 'ai:models', 'ai:providers'],
  rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000 },
  expiresAt: '',
  isActive: true,
});

/** The draft for an existing key, seeded from the row the list already holds. */
export const keyDraftFrom = (apiKey) => ({
  mode: 'edit',
  id: apiKey.id,
  name: apiKey.name || '',
  appName: apiKey.appName || '',
  description: apiKey.description || '',
  permissions: apiKey.permissions || [],
  rateLimit: {
    requestsPerMinute: apiKey.rateLimit?.requestsPerMinute ?? 60,
    requestsPerHour: apiKey.rateLimit?.requestsPerHour ?? 1000,
    requestsPerDay: apiKey.rateLimit?.requestsPerDay ?? 10000,
  },
  // <input type="date"> wants YYYY-MM-DD and nothing else.
  expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt).toISOString().split('T')[0] : '',
  isActive: apiKey.isActive !== false,
});
