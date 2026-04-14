import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  useTheme,
} from '@mui/material';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import { useTemplates } from '../../context/TemplateContext';
import EmptyState from '../shared/EmptyState';
import SkeletonLoader from '../shared/SkeletonLoader';
import TemplateApply from './TemplateApply';
import TemplateEditor from './TemplateEditor';
import { colors } from '../../theme/colors';

const TEMPLATE_TYPES = {
  daily: 'Daily Log',
  weekly: 'Weekly Review',
  monthly: 'Monthly Review',
  meeting: 'Meeting Notes',
  custom: 'Custom',
};

/**
 * TemplateList — editorial grid of template cards.
 *
 * Each card shows the template name in Fraunces serif, type chip, tags,
 * and action buttons. Apply opens the TemplateApply dialog which creates
 * tasks from the template content.
 */
const TemplateList = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { templates, loading, error, deleteTemplate } = useTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const primaryInk = theme.palette.text.primary;
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleDelete = async (templateId) => {
    if (window.confirm('Delete this template? This cannot be undone.')) {
      await deleteTemplate(templateId);
    }
  };

  if (loading) {
    return <SkeletonLoader rows={4} />;
  }

  if (error) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ color: colors.aging.overdue, fontSize: '0.875rem' }}>
          Failed to load templates: {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Action bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          mb: 2,
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<Plus size={16} />}
          onClick={handleCreate}
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            textTransform: 'none',
            px: 2.5,
          }}
        >
          New Template
        </Button>
      </Box>

      {/* Template cards */}
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template to build repeatable task routines — one for morning standup, one for weekly review, one for whatever your day demands."
          action={
            <Button
              variant="outlined"
              size="small"
              startIcon={<Plus size={16} />}
              onClick={handleCreate}
              sx={{
                fontSize: '0.8125rem',
                color: colors.primary[500],
                borderColor: colors.primary[200],
                textTransform: 'none',
                '&:hover': {
                  borderColor: colors.primary[500],
                  backgroundColor: colors.primary[50],
                  transform: 'none',
                },
              }}
            >
              Create your first template
            </Button>
          }
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {templates.map((template) => (
            <Box
              key={template._id || template.id}
              sx={{
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`,
                borderRadius: '10px',
                backgroundColor: theme.palette.background.paper,
                overflow: 'hidden',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                '&:hover': {
                  borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.ink[300],
                  boxShadow: isDark
                    ? '0 4px 12px rgba(0,0,0,0.3)'
                    : `0 4px 12px ${colors.ink[200]}`,
                },
              }}
            >
              {/* Header row */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 2,
                  px: { xs: 2, sm: 2.5 },
                  pt: 2,
                  pb: 1.25,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: '"Fraunces", serif',
                      fontSize: '1.125rem',
                      fontWeight: 500,
                      color: primaryInk,
                      letterSpacing: '-0.005em',
                      lineHeight: 1.2,
                    }}
                  >
                    {template.name}
                  </Typography>
                  {template.description && (
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        color: mutedInk,
                        mt: 0.5,
                        lineHeight: 1.4,
                      }}
                    >
                      {template.description}
                    </Typography>
                  )}
                </Box>

                {/* Edit / delete actions */}
                <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                  <Tooltip title="Edit template" placement="top">
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(template)}
                      sx={{
                        color: mutedInk,
                        '&:hover': { color: colors.primary[500] },
                      }}
                    >
                      <Pencil size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete template" placement="top">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(template._id || template.id)}
                      sx={{
                        color: mutedInk,
                        '&:hover': { color: colors.aging.overdue },
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Tags + type row */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  flexWrap: 'wrap',
                  px: { xs: 2, sm: 2.5 },
                  pb: 1.5,
                }}
              >
                <Chip
                  label={TEMPLATE_TYPES[template.type] || 'Custom'}
                  size="small"
                  sx={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    height: 22,
                    backgroundColor: isDark
                      ? 'rgba(96,152,204,0.15)'
                      : colors.primary[50],
                    color: colors.primary[500],
                    border: `1px solid ${isDark ? 'rgba(96,152,204,0.3)' : colors.primary[200]}`,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
                {template.tags?.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.08)'
                        : colors.ink[100],
                      color: isDark
                        ? 'rgba(255,255,255,0.7)'
                        : colors.ink[600],
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : colors.ink[200]}`,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                ))}
              </Box>

              {/* Apply button row */}
              <Box
                sx={{
                  px: { xs: 2, sm: 2.5 },
                  py: 1.25,
                  borderTop: dottedRule,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.02)'
                    : 'rgba(0,0,0,0.015)',
                }}
              >
                <Button
                  startIcon={<Play size={16} />}
                  onClick={() => setSelectedTemplate(template)}
                  size="small"
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    color: colors.primary[500],
                    '&:hover': {
                      backgroundColor: isDark
                        ? 'rgba(96,152,204,0.1)'
                        : colors.primary[50],
                    },
                  }}
                >
                  Apply Template
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Apply dialog */}
      {selectedTemplate && (
        <TemplateApply
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onApplied={() => setSelectedTemplate(null)}
        />
      )}

      {/* Create/Edit dialog */}
      <TemplateEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingTemplate(null);
        }}
        template={editingTemplate}
      />
    </Box>
  );
};

export default TemplateList;
