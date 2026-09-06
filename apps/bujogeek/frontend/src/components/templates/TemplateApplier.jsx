import { lazy, Suspense, useState } from 'react';
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
/**
 * The markdown preview is the app's only react-markdown consumer, and
 * react-markdown drags the whole unified/remark/micromark/mdast/hast tail with
 * it (153 kB raw / 46 kB gzipped, the `markdown` chunk in vite.config.js). Nothing in the
 * templates route needs any of it until a template is actually opened for
 * apply — this component renders `null` until then — so it loads on that click
 * instead of with the route. `TemplatePreview` itself stays a plain synchronous
 * component; the boundary is here, at its only call site.
 */
const TemplatePreview = lazy(() => import('./TemplatePreview'));

// The same centred spinner this dialog already shows while `applyTemplate` is
// in flight, so a chunk fetch and a network fetch look identical to the user.
const PreviewSpinner = () => (
  <Box display="flex" justifyContent="center" p={4}>
    <CircularProgress />
  </Box>
);

// NOTE (2026-09-05 going-over): this component is mounted by TemplatesPage but
// is unreachable — nothing ever calls `handleOpen`, so `selectedTemplate` stays
// null and it always renders null. TemplateList's "Apply Template" button opens
// `TemplateApply` instead. Left in place (deleting a feature is Chef's call),
// but its id accessor is corrected: templates come back keyed by `id`, and
// `selectedTemplate._id` would have sent `templateId: undefined` into a
// non-null `ID!` argument the moment anyone wired the open handler up.
const applierTemplateId = (template) => template?.id ?? template?._id;

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
      const result = await applyTemplate(applierTemplateId(selectedTemplate), vars);
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
      const result = await applyTemplate(applierTemplateId(selectedTemplate), variables);
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
            <PreviewSpinner />
          ) : (
            <Suspense fallback={<PreviewSpinner />}>
              <TemplatePreview content={previewContent} />
            </Suspense>
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