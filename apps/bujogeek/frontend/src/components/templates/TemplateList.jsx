import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  PlayArrow as ApplyIcon
} from '@mui/icons-material';
import { useTemplates } from '../../context/TemplateContext';
import { useNavigate } from 'react-router-dom';
import TemplateApply from './TemplateApply';

const TEMPLATE_TYPES = {
  daily: 'Daily Log',
  weekly: 'Weekly Review',
  monthly: 'Monthly Review',
  meeting: 'Meeting Notes',
  custom: 'Custom'
};

const TemplateList = () => {
  const {
    templates,
    loading,
    error,
    deleteTemplate
  } = useTemplates();
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const handleEdit = (templateId) => {
    navigate(`/templates/edit/${templateId}`);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (window.confirm('Are you sure you want to delete this template?')) {
      await deleteTemplate(templateId);
    }
  };

  const handleCreateNew = () => {
    navigate('/templates/new');
  };

  const handleApplyTemplate = (template) => {
    setSelectedTemplate(template);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">Error loading templates: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box p={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Templates</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateNew}
        >
          New Template
        </Button>
      </Box>

      <Grid container spacing={2}>
        {templates.map((template) => (
          <Grid item xs={12} sm={6} md={4} key={template._id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">{template.name}</Typography>
                  <Box>
                    <IconButton onClick={() => handleEdit(template._id)} size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteTemplate(template._id)} size="small">
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {template.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Chip
                    label={TEMPLATE_TYPES[template.type] || 'Custom'}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  {template.isPublic && (
                    <Chip
                      label="Public"
                      color="primary"
                      size="small"
                    />
                  )}
                </Box>
                <Box sx={{ mt: 2 }}>
                  {template.tags.map(tag => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  startIcon={<ApplyIcon />}
                  onClick={() => handleApplyTemplate(template)}
                  fullWidth
                >
                  Apply Template
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {selectedTemplate && (
        <TemplateApply
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
    </Box>
  );
};

export default TemplateList;