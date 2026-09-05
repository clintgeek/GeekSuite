import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/**
 * TemplatePreview — renders a task template's body as markdown, styled from
 * the palette instead of ReactMarkdown's unstyled defaults (DOCS/SUITE_TODO.md
 * "bujogeek TemplatePreview markdown": UA-blue links on dark paper, no
 * code-block background, and the content box sharing `background.paper`
 * with the surrounding Paper so the preview had no visual separation).
 *
 * Deliberately does NOT pass `rehype-raw`: react-markdown then treats any
 * literal HTML in the source as inert text rather than rendering it — no
 * raw-HTML pass-through, no separate sanitizer needed (same contract as
 * storygeek's Narration.jsx).
 */
const TemplatePreview = ({ content, variables = {} }) => {
  const theme = useTheme();
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

  const components = useMemo(() => ({
    a: ({ href, children }) => (
      <Typography
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          color: 'primary.main',
          textDecoration: 'none',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        {children}
      </Typography>
    ),
    code: ({ className, children }) => {
      // Fenced code carries a `language-xxx` className from remark-gfm/rehype;
      // plain inline code doesn't. That split is what tells them apart here.
      const isBlock = Boolean(className);
      return (
        <Typography
          component="code"
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: isBlock ? '0.85em' : '0.88em',
            ...(isBlock
              ? { display: 'block', whiteSpace: 'pre-wrap' }
              : {
                  bgcolor: alpha(theme.palette.text.primary, 0.08),
                  color: theme.palette.text.primary,
                  px: 0.5,
                  py: 0.125,
                  borderRadius: 0.75,
                }),
          }}
        >
          {children}
        </Typography>
      );
    },
    pre: ({ children }) => (
      <Typography
        component="pre"
        sx={{
          m: 0,
          mb: 1.25,
          p: 1.25,
          borderRadius: 1.5,
          overflow: 'auto',
          bgcolor: theme.palette.background.default,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        {children}
      </Typography>
    ),
    blockquote: ({ children }) => (
      <Typography
        component="blockquote"
        sx={{
          m: 0,
          my: 1.25,
          pl: 1.75,
          borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.5)}`,
          color: 'text.secondary',
          fontStyle: 'italic',
        }}
      >
        {children}
      </Typography>
    ),
  }), [theme]);

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
      <Box
        sx={{
          minHeight: '200px',
          maxHeight: '400px',
          overflow: 'auto',
          p: 2,
          bgcolor: theme.palette.background.default,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          color: 'text.primary',
          '& p': { mt: 0, mb: 1.25, '&:last-child': { mb: 0 } },
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
          {previewContent}
        </ReactMarkdown>
      </Box>
    </Paper>
  );
};

export default TemplatePreview;
