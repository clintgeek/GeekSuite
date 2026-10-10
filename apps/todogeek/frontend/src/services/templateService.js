import { apolloClient } from '../apolloClient';
import { GET_TEMPLATES, GET_TEMPLATE } from '../graphql/queries';
import { CREATE_TEMPLATE, UPDATE_TEMPLATE, DELETE_TEMPLATE, CREATE_JOURNAL_FROM_TEMPLATE } from '../graphql/mutations';

const templateService = {
  // Get all templates with optional filters
  getTemplates: async (filters = {}) => {
    const { data } = await apolloClient.query({ query: GET_TEMPLATES, variables: filters, fetchPolicy: 'network-only' });
    return data.templates;
  },

  // Get a single template
  getTemplate: async (id) => {
    const { data } = await apolloClient.query({ query: GET_TEMPLATE, variables: { id }, fetchPolicy: 'network-only' });
    return data.template;
  },

  // Create a new template
  createTemplate: async (templateData) => {
    const { data } = await apolloClient.mutate({ mutation: CREATE_TEMPLATE, variables: templateData });
    return data.createTemplate;
  },

  // Update a template
  updateTemplate: async (id, templateData) => {
    const { data } = await apolloClient.mutate({ mutation: UPDATE_TEMPLATE, variables: { id, ...templateData } });
    return data.updateTemplate;
  },

  // Delete a template
  deleteTemplate: async (id) => {
    const { data } = await apolloClient.mutate({ mutation: DELETE_TEMPLATE, variables: { id } });
    return data.deleteTemplate;
  },

  // Apply a template with variables
  applyTemplate: async (id, variables = {}) => {
    // This previously hit /templates/:id/apply which likely just created a journal or returned string.
    // Using CREATE_JOURNAL_FROM_TEMPLATE as it maps best to GraphQL for template application
    const { data } = await apolloClient.mutate({ mutation: CREATE_JOURNAL_FROM_TEMPLATE, variables: { templateId: id, ...variables } });
    return data.createJournalFromTemplate;
  },

  // Get template types
  getTemplateTypes: () => {
    return {
      daily: 'Daily Log',
      weekly: 'Weekly Review',
      monthly: 'Monthly Review',
      meeting: 'Meeting Notes',
      custom: 'Custom'
    };
  }
};

export default templateService;