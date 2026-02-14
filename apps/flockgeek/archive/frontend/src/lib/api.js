const DEFAULT_BASE = '/api/flockgeek/v1';
const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_BASE;
const OWNER_ID = localStorage.getItem('ownerId') || 'demo-owner';

// Token refresh state
let isRefreshing = false;
let refreshPromise = null;

async function refreshToken() {
  const refreshToken = localStorage.getItem('geek_refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  const { token, refreshToken: newRefreshToken } = data.data;

  // Update stored tokens
  localStorage.setItem('geek_token', token);
  localStorage.setItem('geek_refresh_token', newRefreshToken);

  return token;
}

async function http(path, options = {}) {
  const token = localStorage.getItem('geek_token');
  const headers = {
    'Content-Type': 'application/json',
    'X-Owner-Id': OWNER_ID,
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(options.headers || {})
  };
  const url = `${API_BASE}${path}`;

  let res = await fetch(url, { ...options, headers });

  // If we get a 401 and have a refresh token, try to refresh
  if (res.status === 401 && localStorage.getItem('geek_refresh_token')) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshToken()
        .catch(() => {
          // Refresh failed, redirect to login
          localStorage.removeItem('geek_token');
          localStorage.removeItem('geek_refresh_token');
          localStorage.removeItem('ownerId');
          window.location.replace('/login');
          throw new Error('Authentication expired');
        })
        .finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
    }

    // Wait for refresh to complete
    const newToken = await refreshPromise;

    // Retry the original request with new token
    const newHeaders = {
      ...headers,
      'Authorization': `Bearer ${newToken}`
    };
    res = await fetch(url, { ...options, headers: newHeaders });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Request failed: ${res.status} for ${url}`);
  }
  return res.json();
}

function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // Birds
  listBirds: async (params) => (await http(`/birds${qs(params)}`)).data.items,
  getBird: async (id) => (await http(`/birds/${id}`)).data.bird,
  createBird: async (payload) => (await http('/birds', { method: 'POST', body: JSON.stringify(payload) })).data.bird,
  updateBird: async (id, payload) => (await http(`/birds/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.bird,
  deleteBird: async (id) => (await http(`/birds/${id}`, { method: 'DELETE' })).data,
  getBirdLineage: async (id) => (await http(`/birds/${id}/lineage`)).data,
  setBirdParents: async (id, payload) => (await http(`/birds/${id}/parents`, { method: 'POST', body: JSON.stringify(payload) })).data,

  // Groups
  listGroups: async () => (await http('/groups')).data.items,
  createGroup: async (payload) => (await http('/groups', { method: 'POST', body: JSON.stringify(payload) })).data.group,
  updateGroup: async (id, payload) => (await http(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.group,

  // Locations
  listLocations: async () => (await http('/locations')).data.items,
  createLocation: async (payload) => (await http('/locations', { method: 'POST', body: JSON.stringify(payload) })).data.location,
  updateLocation: async (id, payload) => (await http(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.location,
  deleteLocation: async (id) => (await http(`/locations/${id}`, { method: 'DELETE' })).data,

  // Group Memberships
  addBirdToGroup: async (payload) => (await http('/group-memberships', { method: 'POST', body: JSON.stringify(payload) })).data.membership,
  removeBirdFromGroup: async (membershipId) => (await http(`/group-memberships/${membershipId}`, { method: 'DELETE' })).data,
  getBirdGroups: async (birdId, includeLeft = false) => (await http(`/group-memberships/bird/${birdId}${qs({ includeLeft })}`)).data.items,
  getGroupBirds: async (groupId, includeLeft = false) => (await http(`/group-memberships/group/${groupId}${qs({ includeLeft })}`)).data.items,

  // Egg production
  createEggEntry: async (payload) => (await http('/egg-production', { method: 'POST', body: JSON.stringify(payload) })).data.entry,

  // Metrics
  getProductionMetric: async (birdId, period = 'overall') => (await http(`/metrics/production?birdId=${encodeURIComponent(birdId)}&period=${encodeURIComponent(period)}`)).data,

  // Pairings
  listPairings: async () => (await http('/pairings')).data.items,
  createPairing: async (payload) => (await http('/pairings', { method: 'POST', body: JSON.stringify(payload) })).data.pairing,
  getPairingSummary: async (id) => (await http(`/pairings/${id}/summary`)).data,
  updatePairing: async (id, payload) => (await http(`/pairings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.pairing,
  deletePairing: async (id) => (await http(`/pairings/${id}`, { method: 'DELETE' })).data,

  // Hatch events
  createHatchEvent: async (payload) => (await http('/hatch-events', { method: 'POST', body: JSON.stringify(payload) })).data.hatchEvent,
  updateHatchOutcome: async (id, payload) => (await http(`/hatch-events/${id}/outcome`, { method: 'PATCH', body: JSON.stringify(payload) })).data.hatchEvent,

  // Health records
  listHealthRecords: async (params) => (await http(`/health-records${qs(params)}`)).data.items,
  getHealthRecord: async (id) => (await http(`/health-records/${id}`)).data.record,
  createHealthRecord: async (payload) => (await http('/health-records', { method: 'POST', body: JSON.stringify(payload) })).data.record,
  updateHealthRecord: async (id, payload) => (await http(`/health-records/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.record,
  deleteHealthRecord: async (id) => (await http(`/health-records/${id}`, { method: 'DELETE' })).data,

  // Bird traits
  listBirdTraits: async (params) => (await http(`/bird-traits${qs(params)}`)).data.items,
  getBirdTrait: async (id) => (await http(`/bird-traits/${id}`)).data.trait,
  createBirdTrait: async (payload) => (await http('/bird-traits', { method: 'POST', body: JSON.stringify(payload) })).data.trait,
  updateBirdTrait: async (id, payload) => (await http(`/bird-traits/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })).data.trait,
  deleteBirdTrait: async (id) => (await http(`/bird-traits/${id}`, { method: 'DELETE' })).data,
  getBirdWeightHistory: async (birdId, days = 365) => (await http(`/bird-traits/weight-history/${birdId}?days=${days}`)).data,

  // Bird notes
  listBirdNotes: async (params) => (await http(`/bird-notes${qs(params)}`)),
  getBirdNote: async (id) => (await http(`/bird-notes/${id}`)),
  createBirdNote: async (payload) => (await http('/bird-notes', { method: 'POST', body: JSON.stringify(payload) })),
  updateBirdNote: async (id, payload) => (await http(`/bird-notes/${id}`, { method: 'PUT', body: JSON.stringify(payload) })),
  deleteBirdNote: async (id) => (await http(`/bird-notes/${id}`, { method: 'DELETE' })),
};
