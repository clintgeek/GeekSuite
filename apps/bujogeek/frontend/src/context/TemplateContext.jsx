import { createContext, useContext, useState, useEffect } from 'react';
import templateService from '../services/templateService';

const TemplateContext = createContext();

export const TemplateProvider = ({ children }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    tags: [],
    isPublic: undefined,
    search: ''
  });

  // Load templates on mount and when filters change
  useEffect(() => {
    loadTemplates();
  }, [filters]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await templateService.getTemplates(filters);
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createTemplate = async (templateData) => {
    try {
      const newTemplate = await templateService.createTemplate(templateData);
      setTemplates([...templates, newTemplate]);
      return newTemplate;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateTemplate = async (id, templateData) => {
    try {
      const updatedTemplate = await templateService.updateTemplate(id, templateData);
      setTemplates(templates.map(t => t._id === id ? updatedTemplate : t));
      return updatedTemplate;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteTemplate = async (id) => {
    try {
      await templateService.deleteTemplate(id);
      setTemplates(templates.filter(t => t._id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const applyTemplate = async (id, variables) => {
    try {
      return await templateService.applyTemplate(id, variables);
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