import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  getAllInstruments,
  getUserInstruments,
  getActiveInstrument,
  setActiveInstrument as setActiveInstrumentAPI,
  addUserInstrument,
  removeUserInstrument as removeUserInstrumentAPI,
} from '../services/instrumentService';

const InstrumentContext = createContext(null);

export function InstrumentProvider({ children }) {
  const { currentUser, isAuthenticated } = useAuth();
  const [instruments, setInstruments] = useState([]);
  const [userInstruments, setUserInstruments] = useState([]);
  const [activeInstrument, setActiveInstrument] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all available instruments
  useEffect(() => {
    loadInstruments();
  }, []);

  // Load user's instruments when authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      loadUserInstruments();
      loadActiveInstrument();
    } else {
      setUserInstruments([]);
      setActiveInstrument(null);
    }
  }, [isAuthenticated, currentUser]);

  const loadInstruments = async () => {
    try {
      console.log('Loading instruments...');
      const data = await getAllInstruments();
      console.log('Loaded instruments:', data);
      setInstruments(data);
    } catch (err) {
      console.error('Failed to load instruments:', err);
      setError(err.message);
    }
  };

  const loadUserInstruments = async () => {
    try {
      setIsLoading(true);
      const data = await getUserInstruments();
      setUserInstruments(data);
    } catch (err) {
      console.error('Failed to load user instruments:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadActiveInstrument = async () => {
    try {
      const data = await getActiveInstrument();
      setActiveInstrument(data);
    } catch (err) {
      console.error('Failed to load active instrument:', err);
    }
  };

  const switchInstrument = async (instrumentId) => {
    try {
      setError(null);
      const data = await setActiveInstrumentAPI(instrumentId);
      setActiveInstrument(data);

      // Refresh user instruments to update active status
      await loadUserInstruments();

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const addInstrument = async (instrumentId, skillLevel = 'beginner', startFresh = false) => {
    try {
      setError(null);
      const result = await addUserInstrument(instrumentId, skillLevel, startFresh);
      await loadUserInstruments();

      // If this is the first instrument, make it active
      if (userInstruments.length === 0) {
        await switchInstrument(instrumentId);
      }

      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const removeInstrument = async (instrumentId) => {
    try {
      setError(null);
      await removeUserInstrumentAPI(instrumentId);

      // Refresh data
      await loadUserInstruments();
      await loadActiveInstrument();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    instruments,
    userInstruments,
    activeInstrument,
    isLoading,
    error,
    switchInstrument,
    addInstrument,
    removeInstrument,
    refreshInstruments: loadUserInstruments,
  };

  return <InstrumentContext.Provider value={value}>{children}</InstrumentContext.Provider>;
}

export function useInstrument() {
  const context = useContext(InstrumentContext);
  if (!context) {
    throw new Error('useInstrument must be used within InstrumentProvider');
  }
  return context;
}
