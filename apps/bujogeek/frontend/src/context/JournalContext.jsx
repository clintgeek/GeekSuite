import { createContext, useContext, useState, useEffect } from 'react';
import { useApolloClient } from '@apollo/client';
import { GET_JOURNAL_ENTRIES } from '../graphql/queries';
import { CREATE_JOURNAL_ENTRY, UPDATE_JOURNAL_ENTRY, DELETE_JOURNAL_ENTRY } from '../graphql/mutations';

const JournalContext = createContext();

export const JournalProvider = ({ children }) => {
  const apolloClient = useApolloClient();
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
      const response = await apolloClient.query({
        query: GET_JOURNAL_ENTRIES,
        variables: { type: filters.type, tags: filters.tags },
        fetchPolicy: 'no-cache'
      });
      setEntries(response.data?.journalEntries || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createEntry = async (entryData) => {
    try {
      const response = await apolloClient.mutate({
        mutation: CREATE_JOURNAL_ENTRY,
        variables: { ...entryData }
      });
      const newEntry = response.data?.createJournalEntry;
      setEntries([newEntry, ...entries]);
      return newEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateEntry = async (id, entryData) => {
    try {
      const cleanData = { ...entryData };
      delete cleanData.__typename;
      delete cleanData.id;
      delete cleanData._id;
      const response = await apolloClient.mutate({
        mutation: UPDATE_JOURNAL_ENTRY,
        variables: { id, ...cleanData }
      });
      const updatedEntry = response.data?.updateJournalEntry;
      setEntries(entries.map(e => (e._id === id || e.id === id) ? updatedEntry : e));
      return updatedEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteEntry = async (id) => {
    try {
      await apolloClient.mutate({
        mutation: DELETE_JOURNAL_ENTRY,
        variables: { id }
      });
      setEntries(entries.filter(e => e._id !== id && e.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const createFromTemplate = async (templateData) => {
    // Note: Template operations are still handled via legacy REST layer due to complex variable interpolation
    // Currently skipping full abstraction as requested by MVP approach
    throw new Error('createFromTemplate needs to be implemented in GraphQL or fallback to REST wrapper separately');
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