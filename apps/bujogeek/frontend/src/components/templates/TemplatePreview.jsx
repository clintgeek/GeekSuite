import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Divider,
  CircularProgress
} from '@mui/material';
import ReactMarkdown from 'react-markdown';

const TemplatePreview = ({ content, variables = {} }) => {
  const [previewContent, setPreviewContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    let processedContent = content;

    // Replace variables in the content
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedContent = processedContent.replace(regex, value || `{{${key}}}`);
    });

    setPreviewContent(processedContent);
    setIsLoading(false);
  }, [content, variables]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Preview
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <Box sx={{
        minHeight: '200px',
        maxHeight: '400px',
        overflow: 'auto',
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1
      }}>
        <ReactMarkdown>{previewContent}</ReactMarkdown>
      </Box>
    </Paper>
  );
};

export default TemplatePreview;