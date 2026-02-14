import { createContext, useContext, useState, useEffect } from 'react';
import journalService from '../services/journalService';

const JournalContext = createContext();

export const JournalProvider = ({ children }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    startDate: null,
    endDate: null,
    search: '',
    tags: []
  });

  // Load entries on mount and when filters change
  useEffect(() => {
    loadEntries();
  }, [filters]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      const data = await journalService.getEntries(filters);
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createEntry = async (entryData) => {
    try {
      const newEntry = await journalService.createEntry(entryData);
      setEntries([newEntry, ...entries]);
      return newEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateEntry = async (id, entryData) => {
    try {
      const updatedEntry = await journalService.updateEntry(id, entryData);
      setEntries(entries.map(e => e._id === id ? updatedEntry : e));
      return updatedEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteEntry = async (id) => {
    try {
      await journalService.deleteEntry(id);
      setEntries(entries.filter(e => e._id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const createFromTemplate = async (templateData) => {
    try {
      const newEntry = await journalService.createFromTemplate(templateData);
      setEntries([newEntry, ...entries]);
      return newEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateFilters = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  const clearFilters = () => {
    setFilters({
      type: '',
      startDate: null,
      endDate: null,
      search: '',
      tags: []
    });
  };

  const value = {
    entries,
    loading,
    error,
    filters,
    createEntry,
    updateEntry,
    deleteEntry,
    createFromTemplate,
    updateFilters,
    clearFilters,
    refreshEntries: loadEntries
  };

  return (
    <JournalContext.Provider value={value}>
      {children}
    </JournalContext.Provider>
  );
};

export const useJournal = () => {
  const context = useContext(JournalContext);
  if (!context) {
    throw new Error('useJournal must be used within a JournalProvider');
  }
  return context;
};