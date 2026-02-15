import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Select, MenuItem, FormControl, InputLabel, Typography, useTheme } from '@mui/material';

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

  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: isDark ? '#1e1e1e' : '#f5f5f5',
        }}
      >
        <FormControl variant="outlined" size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="code-language-label">Language</InputLabel>
          <Select
            labelId="code-language-label"
            value={language}
            onChange={handleLanguageChange}
            label="Language"
            disabled={readOnly}
            sx={{ bgcolor: 'background.paper' }}
          >
            {CODE_LANGUAGES.map((lang) => (
              <MenuItem key={lang.value} value={lang.value}>
                {lang.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary">
          {code.split('\n').length} lines
        </Typography>
      </Box>

      {/* Code area */}
      <Box
        sx={{
          flexGrow: 1,
          position: 'relative',
          bgcolor: isDark ? '#1e1e1e' : '#fafafa',
          overflow: 'hidden',
        }}
      >
        {/* Line numbers */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 48,
            bgcolor: isDark ? '#252526' : '#f0f0f0',
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'hidden',
            pt: 1.5,
            px: 1,
            textAlign: 'right',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {(code || ' ').split('\n').map((_, i) => (
            <Typography
              key={i}
              variant="body2"
              sx={{
                fontFamily: '"Roboto Mono", monospace',
                fontSize: `${fontSize}px`,
                lineHeight: 1.6,
                color: 'text.disabled',
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
          spellCheck={false}
          sx={{
            position: 'absolute',
            top: 0,
            left: 48,
            right: 0,
            bottom: 0,
            width: 'calc(100% - 48px)',
            height: '100%',
            p: 1.5,
            border: 'none',
            outline: 'none',
            resize: 'none',
            bgcolor: 'transparent',
            color: 'text.primary',
            fontFamily: '"Roboto Mono", monospace',
            fontSize: `${fontSize}px`,
            lineHeight: 1.6,
            overflow: 'auto',
            whiteSpace: 'pre',
            '&::placeholder': {
              color: 'text.disabled',
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