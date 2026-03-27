import { apolloClient } from '../apolloClient';
import { GET_JOURNAL_ENTRIES, GET_JOURNAL_ENTRY } from '../graphql/queries';
import { CREATE_JOURNAL_ENTRY, UPDATE_JOURNAL_ENTRY, DELETE_JOURNAL_ENTRY, CREATE_JOURNAL_FROM_TEMPLATE } from '../graphql/mutations';

const journalService = {
  // Get all journal entries with optional filters
  getEntries: async (filters = {}) => {
    const { data } = await apolloClient.query({ query: GET_JOURNAL_ENTRIES, variables: filters, fetchPolicy: 'network-only' });
    return data.journalEntries;
  },

  // Get a single journal entry
  getEntry: async (id) => {
    const { data } = await apolloClient.query({ query: GET_JOURNAL_ENTRY, variables: { id }, fetchPolicy: 'network-only' });
    return data.journalEntry;
  },

  // Create a new journal entry
  createEntry: async (entryData) => {
    const { data } = await apolloClient.mutate({ mutation: CREATE_JOURNAL_ENTRY, variables: entryData });
    return data.createJournalEntry;
  },

  // Update a journal entry
  updateEntry: async (id, entryData) => {
    const { data } = await apolloClient.mutate({ mutation: UPDATE_JOURNAL_ENTRY, variables: { id, ...entryData } });
    return data.updateJournalEntry;
  },

  // Delete a journal entry
  deleteEntry: async (id) => {
    const { data } = await apolloClient.mutate({ mutation: DELETE_JOURNAL_ENTRY, variables: { id } });
    return data.deleteJournalEntry;
  },

  // Create entry from template
  createFromTemplate: async (templateData) => {
    const { data } = await apolloClient.mutate({ mutation: CREATE_JOURNAL_FROM_TEMPLATE, variables: templateData });
    return data.createJournalFromTemplate;
  }
};

export default journalService;