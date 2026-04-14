import { useState, useMemo } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Dialog,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
  useTheme,
} from '@mui/material';
import { X, Play, FileText } from 'lucide-react';
import { useTaskContext } from '../../context/TaskContext';
import { useToast } from '../shared/Toast';
import { colors } from '../../theme/colors';
import { toLocalDateString } from '../../utils/dateUtils';

/**
 * TemplateApply — apply a template to create tasks for today.
 *
 * Each non-empty line of the template content becomes a task.
 * Supports {{variable}} interpolation — any {{name}} in the content
 * is detected and rendered as an input field. Values are substituted
 * before task creation.
 *
 * Example template content:
 *   Review {{yesterday_focus}}
 *   Plan today's main goal
 *   Check CI pipeline
 *   Reply to {{person}} about {{topic}}
 *
 * Applying this creates 4 tasks with today's due date. The user fills
 * in {{yesterday_focus}}, {{person}}, and {{topic}} before applying.
 */
const TemplateApply = ({ template, onClose, onApplied }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { createTask } = useTaskContext();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extract variable names from template content
  const variableNames = useMemo(() => {
    if (!template?.content) return [];
    const matches = template.content.match(/\{\{(\w+)\}\}/g) || [];
    const unique = [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))];
    return unique;
  }, [template?.content]);

  const [variables, setVariables] = useState(() =>
    variableNames.reduce((acc, name) => ({ ...acc, [name]: '' }), {})
  );

  // Interpolate variables and split into task lines
  const previewLines = useMemo(() => {
    if (!template?.content) return [];
    let text = template.content;
    for (const [key, val] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [template?.content, variables]);

  const handleApply = async () => {
    if (previewLines.length === 0) return;
    setLoading(true);
    setError(null);

    const today = toLocalDateString(new Date());
    let created = 0;

    try {
      for (const line of previewLines) {
        await createTask({
          content: line,
          signifier: '*',
          status: 'pending',
          dueDate: today,
          tags: template.tags || [],
        });
        created += 1;
      }
      toast.success(`Created ${created} task${created !== 1 ? 's' : ''} from "${template.name}"`);
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create tasks');
    } finally {
      setLoading(false);
    }
  };

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
        },
      }}
    >
      {/* ─── Editorial header ─────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          px: { xs: 3, sm: 3.5 },
          pt: { xs: 3, sm: 3.5 },
          pb: 2,
          borderBottom: dottedRule,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              fontWeight: 400,
              color: captionInk,
              letterSpacing: '0.01em',
              mb: 0.5,
            }}
          >
            Apply template
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '1.375rem', sm: '1.5rem' },
              fontWeight: 500,
              color: primaryInk,
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            {template?.name || 'Template'}
          </Typography>
          {template?.description && (
            <Typography sx={{ fontSize: '0.8125rem', color: mutedInk, mt: 0.5 }}>
              {template.description}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close"
          sx={{ color: mutedInk, mt: 0.5, '&:hover': { color: primaryInk } }}
        >
          <X size={18} />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: { xs: 3, sm: 3.5 }, py: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Variable inputs (if any) */}
        {variableNames.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: primaryInk,
                mb: 1.25,
              }}
            >
              Fill in the blanks
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {variableNames.map((name) => (
                <TextField
                  key={name}
                  label={name.replace(/_/g, ' ')}
                  value={variables[name]}
                  onChange={(e) =>
                    setVariables((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  fullWidth
                  size="small"
                  placeholder={`Enter ${name.replace(/_/g, ' ')}...`}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Task preview */}
        <Box>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: primaryInk,
              mb: 1.25,
            }}
          >
            {previewLines.length} {previewLines.length === 1 ? 'task' : 'tasks'} will be created for today
          </Typography>
          <Box
            sx={{
              borderTop: dottedRule,
              borderBottom: dottedRule,
              py: 0.5,
            }}
          >
            {previewLines.map((line, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 1,
                  px: 1,
                  borderBottom:
                    i < previewLines.length - 1 ? dottedRule : 'none',
                }}
              >
                {/* Fake checkbox */}
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border: `1.5px solid ${mutedInk}`,
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    color: primaryInk,
                    lineHeight: 1.4,
                  }}
                >
                  {line}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>

      {/* ─── Actions ──────────────────────────────────────────── */}
      <DialogActions
        sx={{
          px: { xs: 3, sm: 3.5 },
          py: 2,
          borderTop: dottedRule,
          gap: 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
        }}
      >
        <Button
          onClick={onClose}
          size="small"
          sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={loading || previewLines.length === 0}
          startIcon={<Play size={16} />}
          size="small"
          sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5 }}
        >
          {loading ? 'Creating...' : `Create ${previewLines.length} Tasks`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateApply;
