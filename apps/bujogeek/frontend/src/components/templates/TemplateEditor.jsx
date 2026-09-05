import { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  useTheme,
} from '@mui/material';
import BujoDialog from '../primitives/BujoDialog';
import { useTemplates } from '../../context/TemplateContext';
import { colors } from '../../theme/colors';
import { useToast } from '@geeksuite/ui';

const TEMPLATE_TYPES = [
  { value: 'daily', label: 'Daily Log' },
  { value: 'weekly', label: 'Weekly Review' },
  { value: 'monthly', label: 'Monthly Review' },
  { value: 'meeting', label: 'Meeting Notes' },
  { value: 'custom', label: 'Custom' },
];

/**
 * TemplateEditor — create or edit a template.
 *
 * The content field is the template body. Each line becomes a task when
 * applied. Supports {{variable}} placeholders that get prompted at apply
 * time.
 *
 * Example content:
 *   Review {{yesterday_focus}}
 *   Plan today's main goal
 *   Check CI pipeline
 *   Reply to {{person}} about {{topic}}
 *
 * The dialog itself is a `BujoDialog` — the app's skin over `GeekDialog` —
 * so it goes full-screen below `sm` with the shared close / title / save
 * header instead of being a 326px card on a phone.
 */
const FORM_ID = 'bujo-template-editor-form';
const TemplateEditor = ({ open, onClose, template = null }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { createTemplate, updateTemplate } = useTemplates();
  const { notify } = useToast();

  const isEditing = Boolean(template);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
    type: 'daily',
    tags: [],
    isPublic: false,
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        description: template.description || '',
        content: template.content || '',
        type: template.type || 'daily',
        tags: template.tags || [],
        isPublic: template.isPublic || false,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        content: '',
        type: 'daily',
        tags: [],
        isPublic: false,
      });
    }
    setTagInput('');
  }, [template, open]);

  const handleChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!formData.tags.includes(newTag)) {
        setFormData({ ...formData, tags: [...formData.tags, newTag] });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.content.trim()) return;
    setLoading(true);
    try {
      if (isEditing) {
        await updateTemplate(template._id || template.id, formData);
        notify('Template updated', { tone: 'success' });
      } else {
        await createTemplate(formData);
        notify('Template created', { tone: 'success' });
      }
      onClose();
    } catch (err) {
      notify(err.message || 'Failed to save template', { tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Count how many tasks the content would create
  const taskCount = formData.content
    .split('\n')
    .filter((line) => line.trim().length > 0).length;

  const primaryInk = theme.palette.text.primary;
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  return (
    <BujoDialog
      open={open}
      onClose={onClose}
      eyebrow={isEditing ? 'Editing template' : 'New routine'}
      title={isEditing ? template?.name || 'Edit Template' : 'Create Template'}
      primaryAction={
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          disabled={loading || !formData.name.trim() || !formData.content.trim()}
          size="small"
          sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5 }}
        >
          {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
        </Button>
      }
      secondaryAction={
        <Button
          onClick={onClose}
          size="small"
          sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
        >
          Cancel
        </Button>
      }
    >
      <Box component="form" id={FORM_ID} onSubmit={handleSubmit}>
          {/* Name */}
          <Box sx={{ mb: 2.5 }}>
            <TextField
              label="Template name"
              value={formData.name}
              onChange={handleChange('name')}
              required
              fullWidth
              size="small"
              placeholder="e.g. Morning Standup, Weekly Review..."
            />
          </Box>

          {/* Description */}
          <Box sx={{ mb: 2.5 }}>
            <TextField
              label="Description (optional)"
              value={formData.description}
              onChange={handleChange('description')}
              fullWidth
              size="small"
              placeholder="What is this routine for?"
            />
          </Box>

          {/* Content — the template body */}
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: primaryInk,
                mb: 1,
              }}
            >
              Tasks
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: mutedInk, mb: 1 }}>
              One task per line. Use {'{{variable}}'} for values you fill in each time.
            </Typography>
            <TextField
              value={formData.content}
              onChange={handleChange('content')}
              required
              fullWidth
              multiline
              rows={6}
              size="small"
              placeholder={`Review yesterday's {{focus}}\nPlan today's main goal\nCheck CI pipeline\nReply to {{person}} about {{topic}}`}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.8125rem',
                  lineHeight: 1.7,
                },
              }}
            />
            {taskCount > 0 && (
              <Typography
                sx={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.6875rem',
                  color: mutedInk,
                  mt: 0.75,
                  letterSpacing: '0.04em',
                }}
              >
                {taskCount} {taskCount === 1 ? 'task' : 'tasks'} per application
              </Typography>
            )}
          </Box>

          <Box sx={{ borderTop: dottedRule, pt: 2.5 }}>
            {/* Type + tags row */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  onChange={handleChange('type')}
                  label="Type"
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Tags */}
            <Box>
              <TextField
                label="Tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Press Enter to add"
                fullWidth
                size="small"
              />
              {formData.tags.length > 0 && (
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {formData.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onDelete={() => handleRemoveTag(tag)}
                      size="small"
                      sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
      </Box>
    </BujoDialog>
  );
};

export default TemplateEditor;
