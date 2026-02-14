import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  CircularProgress
} from '@mui/material';
import { useTemplates } from '../../context/TemplateContext';
import TemplatePreview from './TemplatePreview';

const TemplateApplier = ({ onTemplateApplied }) => {
  const { applyTemplate } = useTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({});
  const [previewContent, setPreviewContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpen = (template) => {
    setSelectedTemplate(template);
    setVariables({});
    setPreviewContent('');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedTemplate(null);
    setVariables({});
    setPreviewContent('');
  };

  const handleVariableChange = (key, value) => {
    const newVariables = { ...variables, [key]: value };
    setVariables(newVariables);
    updatePreview(newVariables);
  };

  const updatePreview = async (vars) => {
    if (!selectedTemplate) return;

    try {
      setLoading(true);
      const result = await applyTemplate(selectedTemplate._id, vars);
      setPreviewContent(result.content);
    } catch (error) {
      console.error('Error updating preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setLoading(true);
      const result = await applyTemplate(selectedTemplate._id, variables);
      onTemplateApplied(result);
      handleClose();
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedTemplate) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Apply Template: {selectedTemplate.name}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Template Variables
          </Typography>
          {Object.entries(selectedTemplate.variables || {}).map(([key, label]) => (
            <TextField
              key={key}
              fullWidth
              label={label}
              value={variables[key] || ''}
              onChange={(e) => handleVariableChange(key, e.target.value)}
              margin="normal"
            />
          ))}
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Preview
          </Typography>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : (
            <TemplatePreview content={previewContent} />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleApply}
          variant="contained"
          color="primary"
          disabled={loading}
        >
          Apply Template
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateApplier;