import { useState } from 'react';
import { useTemplates } from '../context/TemplateContext';

export const useTemplate = () => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [variables, setVariables] = useState({});

  const {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    refreshTemplates
  } = useTemplates();

  const handleCreate = async (templateData) => {
    try {
      const newTemplate = await createTemplate(templateData);
      setSelectedTemplate(newTemplate);
      return newTemplate;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  };

  const handleUpdate = async (id, templateData) => {
    try {
      const updatedTemplate = await updateTemplate(id, templateData);
      setSelectedTemplate(updatedTemplate);
      return updatedTemplate;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTemplate(id);
      if (selectedTemplate?._id === id) {
        setSelectedTemplate(null);
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  };

  const handleApply = async (id, templateVariables = {}) => {
    try {
      const result = await applyTemplate(id, templateVariables);
      return result;
    } catch (error) {
      console.error('Error applying template:', error);
      throw error;
    }
  };

  const handleVariableChange = (name, value) => {
    setVariables(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return {
    templates,
    selectedTemplate,
    setSelectedTemplate,
    isEditing,
    setIsEditing,
    variables,
    setVariables,
    loading,
    error,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleApply,
    handleVariableChange,
    refreshTemplates
  };
};