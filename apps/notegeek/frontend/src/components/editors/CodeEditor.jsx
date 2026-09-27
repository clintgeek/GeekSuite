import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Select, MenuItem, FormControl, Typography, useTheme } from '@mui/material';
import { noteTypeInk, surfaces } from '../../theme/tokens';

const CODE_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Bash/Shell' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'plaintext', label: 'Plain Text' }
];

/**
 * CodeEditor - Lightweight code editor with language selection
 * Stores content as JSON: { language, code }
 * Falls back to raw string for backwards compatibility
 */
function CodeEditor({ content = '', setContent, readOnly = false, fontSize = 14 }) {
  const theme = useTheme();
  const textareaRef = useRef(null);
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const initialized = useRef(false);

  // Parse content on mount - handle both JSON and raw string formats
  useEffect(() => {
    if (initialized.current) return;

    try {
      if (content && content.startsWith('{')) {
        const parsed = JSON.parse(content);
        if (parsed.language && CODE_LANGUAGES.some(l => l.value === parsed.language)) {
          setLanguage(parsed.language);
        }
        setCode(parsed.code || '');
      } else {
        // Legacy format: raw code string
        setCode(content || '');
      }
    } catch {
      // Not JSON, treat as raw code
      setCode(content || '');
    }
    initialized.current = true;
  }, [content]);

  // Update parent with JSON format when code or language changes
  const updateContent = useCallback((newCode, newLanguage) => {
    const newContent = JSON.stringify({
      language: newLanguage,
      code: newCode
    });
    setContent(newContent);
  }, [setContent]);

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateContent(newCode, language);
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    updateContent(code, newLanguage);
  };

  // Handle tab key for indentation
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      updateContent(newCode, language);
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const lineCount = (code || '').split('\n').length;
  const lineHeight = 1.6;
  const mono = theme.typography.fontFamilyMono;

  // A code page, not a code box: the textarea grows by rows (never fewer
  // than 16) and the page scrolls around it, like every other page type.
  // Long lines scroll sideways inside the textarea only.
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
      {/* Toolbar — the same slim sticky strip as the other page editors */}
      <Box
        role="toolbar"
        aria-label="Code"
        data-editor-toolbar
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          py: '4px',
          mb: '16px',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: surfaces(theme).elevated,
        }}
      >
        <Typography
          component="label"
          id="code-language-label"
          htmlFor="code-language-select"
          variant="caption"
          sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Language
        </Typography>
        <FormControl variant="standard" size="small">
          <Select
            id="code-language-select"
            labelId="code-language-label"
            value={language}
            onChange={handleLanguageChange}
            disabled={readOnly}
            disableUnderline
            sx={{
              fontFamily: mono,
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: noteTypeInk(theme, 'code'),
              minHeight: { xs: 44, md: 32 },
              '& .MuiSelect-select': { py: '4px', pr: '24px !important' },
            }}
          >
            {CODE_LANGUAGES.map((lang) => (
              <MenuItem key={lang.value} value={lang.value}>
                {lang.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </Typography>
      </Box>

      {/* Code area: gutter + textarea, side by side */}
      <Box
        sx={{
          flex: '1 0 auto',
          display: 'flex',
          alignItems: 'stretch',
          minWidth: 0,
          borderRadius: '4px',
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: surfaces(theme).paper,
          overflow: 'hidden',
        }}
      >
        {/* Line numbers */}
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            minWidth: 44,
            py: '12px',
            px: '8px',
            textAlign: 'right',
            userSelect: 'none',
            pointerEvents: 'none',
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          {(code || ' ').split('\n').map((_, i) => (
            <Typography
              key={i}
              component="div"
              sx={{
                fontFamily: mono,
                fontSize: `${fontSize}px`,
                lineHeight,
                color: 'text.secondary',
              }}
            >
              {i + 1}
            </Typography>
          ))}
        </Box>

        {/* Textarea */}
        <Box
          component="textarea"
          ref={textareaRef}
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          disabled={readOnly}
          placeholder="// Write your code here..."
          aria-label="Code"
          spellCheck={false}
          // +1 leaves room for a sideways scrollbar under the last line.
          rows={Math.max(lineCount + 1, 16)}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'block',
            py: '12px',
            px: '12px',
            m: 0,
            border: 'none',
            outline: 'none',
            resize: 'none',
            bgcolor: 'transparent',
            color: 'text.primary',
            fontFamily: mono,
            fontSize: `${fontSize}px`,
            lineHeight,
            overflowX: 'auto',
            overflowY: 'hidden',
            whiteSpace: 'pre',
            // Code is shown as typed: JetBrains Mono's ligatures would draw
            // `=>` as one arrow glyph the writer never typed.
            fontVariantLigatures: 'none',
            '&::placeholder': {
              color: 'text.secondary',
            },
            '&:disabled': {
              color: 'text.primary',
              cursor: 'default',
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default CodeEditor;