import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import templateService from '../services/templateService';
import { apolloClient } from '../apolloClient';
import { CREATE_JOURNAL_FROM_TEMPLATE } from '../graphql/mutations';
import { onJournalEntryCreated } from '../graphql/cacheUpdates';

const TemplateContext = createContext();

/**
 * The gateway returns templates keyed by `id`. Every splice in this file used
 * to compare `t._id`, which is `undefined` on a GraphQL result — so deleting a
 * template left it on screen and editing one showed no change until the next
 * page load. One accessor, used everywhere.
 */
const templateId = (template) => String(template?.id ?? template?._id ?? '');

/**
 * `templates(type:, isDefault:)` is the whole server-side filter surface
 * (`graphql/bujogeek/typeDefs.js`). `search` and `tags` were being handed to
 * `apolloClient.query` as variables the operation never declares, so they were
 * dropped on the floor: the "Search templates…" box refetched the identical
 * list on every keystroke and filtered nothing. They are applied here instead.
 */
const matchesLocalFilters = (template, filters) => {
  const search = (filters.search || '').trim().toLowerCase();
  if (search) {
    const haystack = [
      template?.name,
      template?.description,
      template?.content,
      ...(template?.tags || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  const wanted = (filters.tags || []).filter(Boolean);
  if (wanted.length && !wanted.every((tag) => (template?.tags || []).includes(tag))) {
    return false;
  }

  if (filters.isPublic !== undefined && Boolean(template?.isPublic) !== Boolean(filters.isPublic)) {
    return false;
  }

  return true;
};

export const TemplateProvider = ({ children }) => {
  const [allTemplates, setAllTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    tags: [],
    isPublic: undefined,
    search: ''
  });

  const loadTemplates = useCallback(async (type = filters.type) => {
    try {
      setLoading(true);
      const data = await templateService.getTemplates({ type: type || undefined });
      setAllTemplates(data ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.type]);

  // Only `type` is a server-side filter, so only `type` triggers a refetch.
  // Keying this on the whole `filters` object fired a `network-only` query per
  // keystroke of a search box that did not filter anything.
  useEffect(() => {
    loadTemplates(filters.type);
  }, [filters.type, loadTemplates]);

  const templates = useMemo(
    () => allTemplates.filter((template) => matchesLocalFilters(template, filters)),
    [allTemplates, filters]
  );

  const createTemplate = async (templateData) => {
    try {
      const newTemplate = await templateService.createTemplate(templateData);
      setAllTemplates((prev) => [...prev, newTemplate]);
      return newTemplate;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateTemplate = async (id, templateData) => {
    try {
      const updatedTemplate = await templateService.updateTemplate(id, templateData);
      setAllTemplates((prev) => prev.map((t) => (
        templateId(t) === String(id) ? updatedTemplate : t
      )));
      return updatedTemplate;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteTemplate = async (id) => {
    try {
      await templateService.deleteTemplate(id);
      setAllTemplates((prev) => prev.filter((t) => templateId(t) !== String(id)));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const applyTemplate = async (id, variables) => {
    try {
      // Not routed through templateService: the cache rule (apolloClient.js)
      // needs `update` in the same `mutate()` call that writes the result, so
      // this is the one template call the context makes directly — the same
      // shape TaskContext uses for every task mutation.
      const { data } = await apolloClient.mutate({
        mutation: CREATE_JOURNAL_FROM_TEMPLATE,
        variables: { templateId: id, ...variables },
        // Clause 2: the entry this creates has to join whichever cached
        // `journalEntries` list its type/tags satisfy. It was landing in the
        // database with no cache consequence at all — a silent mutation.
        update: onJournalEntryCreated,
      });
      return data?.createJournalFromTemplate;
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
      tags: [],
      isPublic: undefined,
      search: ''
    });
  };

  const value = {
    templates,
    loading,
    error,
    filters,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    updateFilters,
    clearFilters,
    refreshTemplates: loadTemplates,
    templateTypes: templateService.getTemplateTypes()
  };

  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplates = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplates must be used within a TemplateProvider');
  }
  return context;
};