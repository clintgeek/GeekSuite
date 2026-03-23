import { api } from './api';

// Get all available instruments
export async function getAllInstruments() {
  const response = await api.get('/api/instruments');
  return response.data;
}

// Get instrument by ID
export async function getInstrumentById(id) {
  const response = await api.get(`/api/instruments/${id}`);
  return response.data;
}

// Get tuning configurations for an instrument
export async function getTuningConfigurations(instrumentId) {
  const response = await api.get(`/api/instruments/${instrumentId}/tunings`);
  return response.data;
}

// Get user's instruments
export async function getUserInstruments() {
  const response = await api.get('/api/instruments/user/instruments');
  return response.data;
}

// Add instrument to user's profile
export async function addUserInstrument(instrumentId, skillLevel = 'beginner', startFresh = false) {
  const response = await api.post('/api/instruments/user/instruments', {
    instrument_id: instrumentId,
    skill_level: skillLevel,
    start_fresh: startFresh,
  });
  return response.data;
}

// Check if user previously had an instrument
export async function checkPreviousInstrument(instrumentId) {
  try {
    const response = await api.get(`/api/instruments/user/instruments/${instrumentId}/check`);
    return response.data;
  } catch (error) {
    return null;
  }
}

// Get user's active instrument
export async function getActiveInstrument() {
  const response = await api.get('/api/instruments/user/active-instrument');
  return response.data;
}

// Set user's active instrument
export async function setActiveInstrument(instrumentId) {
  const response = await api.put('/api/instruments/user/active-instrument', {
    instrument_id: instrumentId,
  });
  return response.data;
}

// Remove instrument from user's profile
export async function removeUserInstrument(instrumentId) {
  const response = await api.delete(`/api/instruments/user/instruments/${instrumentId}`);
  return response.data;
}

// Default export
export default {
  getAllInstruments,
  getInstrumentById,
  getTuningConfigurations,
  getUserInstruments,
  addUserInstrument,
  getActiveInstrument,
  setActiveInstrument,
  removeUserInstrument,
  checkPreviousInstrument,
};
