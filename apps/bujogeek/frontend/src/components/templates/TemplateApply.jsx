import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Stack,
  Divider
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useJournal } from '../../context/JournalContext';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const TemplateApply = ({ template, onClose }) => {
  const { createFromTemplate } = useJournal();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    title: template?.name || '',
    date: new Date(),
    variables: template?.variables?.reduce((acc, v) => ({
      ...acc,
      [v.name]: v.defaultValue || ''
    }), {}) || {},
    metadata: {
      mood: '',
      energy: '',
      location: '',
      weather: ''
    }
  });

  const handleVariableChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      variables: {
        ...prev.variables,
        [name]: value
      }
    }));
  };

  const handleMetadataChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const entry = await createFromTemplate({
        templateId: template._id,
        title: formData.title,
        date: formData.date,
        variables: formData.variables,
        metadata: formData.metadata
      });

      // Navigate to the new entry
      navigate(`/journal/${entry._id}`);
    } catch (err) {
      setError(err.message || 'Failed to create entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Apply Template: {template?.name}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Stack spacing={3}>
            <TextField
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              fullWidth
            />

            <DatePicker
              label="Date"
              value={formData.date}
              onChange={(newDate) => setFormData({ ...formData, date: newDate })}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />

            {template?.variables && (
              <>
                <Typography variant="h6">Template Variables</Typography>
                <Stack spacing={2}>
                  {template.variables.map((variable) => (
                    <TextField
                      key={variable.name}
                      label={variable.name}
                      type={variable.type === 'date' ? 'date' : 'text'}
                      value={formData.variables[variable.name] || ''}
                      onChange={(e) => handleVariableChange(variable.name, e.target.value)}
                      required={variable.required}
                      fullWidth
                    />
                  ))}
                </Stack>
              </>
            )}

            <Divider />

            <Typography variant="h6">Metadata</Typography>
            <Stack spacing={2}>
              <TextField
                label="Mood"
                value={formData.metadata.mood}
                onChange={(e) => handleMetadataChange('mood', e.target.value)}
                fullWidth
              />
              <TextField
                label="Energy Level"
                value={formData.metadata.energy}
                onChange={(e) => handleMetadataChange('energy', e.target.value)}
                fullWidth
              />
              <TextField
                label="Location"
                value={formData.metadata.location}
                onChange={(e) => handleMetadataChange('location', e.target.value)}
                fullWidth
              />
              <TextField
                label="Weather"
                value={formData.metadata.weather}
                onChange={(e) => handleMetadataChange('weather', e.target.value)}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Create Entry'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default TemplateApply;