import React, { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useAppPreferences } from '@geeksuite/user';

// Lazy load editors to reduce initial bundle size
// Critical for low-memory devices like Fire tablets
const MarkdownEditor = lazy(() => import('../editors/MarkdownEditor'));
const HandwrittenEditor = lazy(() => import('../editors/HandwrittenEditor'));

// Note type constants
export const NOTE_TYPES = {
  MARKDOWN: 'markdown',
  HANDWRITTEN: 'handwritten',
};

// Loading fallback - minimal to reduce memory pressure
const EditorLoading = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: 200,
    }}
  >
    <CircularProgress size={32} />
  </Box>
);

/**
 * NoteTypeRouter - Routes to the correct editor based on note type
 * All editors implement the same interface:
 *   - content: string
 *   - onChange: (content: string) => void
 *   - readOnly?: boolean
 */
function NoteTypeRouter({
  type,
  content,
  onChange,
  readOnly = false,
  // Pass through any additional props specific editors might need
  ...props
}) {
  const { preferences: appPrefs } = useAppPreferences('notegeek');
  const editorFontSize = appPrefs?.editorFontSize ?? 14;

  const renderEditor = () => {
    if (type === NOTE_TYPES.HANDWRITTEN) {
      return (
        <HandwrittenEditor
          content={content}
          setContent={onChange}
          readOnly={readOnly}
          {...props}
        />
      );
    }
    return (
      <MarkdownEditor
        content={content}
        setContent={onChange}
        readOnly={readOnly}
        fontSize={editorFontSize}
        {...props}
      />
    );
  };

  return (
    <Suspense fallback={<EditorLoading />}>
      {renderEditor()}
    </Suspense>
  );
}

export default NoteTypeRouter;
