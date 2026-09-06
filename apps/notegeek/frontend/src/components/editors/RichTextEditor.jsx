import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Box, ButtonGroup, Button, Tooltip } from '@mui/material';
// Deep-import each icon (rather than the '@mui/icons-material' barrel) —
// the barrel re-exports 2000+ icons and is catastrophically slow to load
// under Vite's SSR module runner (the one vitest uses for jsdom tests),
// which was causing whole test files to take minutes to tear down.
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import FormatUnderlined from '@mui/icons-material/FormatUnderlined';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import FormatListNumbered from '@mui/icons-material/FormatListNumbered';
import FormatQuote from '@mui/icons-material/FormatQuote';
import Code from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';

const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <ButtonGroup
      sx={{
        mb: 1.5,
        flexShrink: 0,
        display: 'flex',
        // Below `md` there isn't room for eight buttons in one row without
        // horizontal scroll clipping the last few tools; wrap to a second
        // row instead. `ButtonGroup`'s grouped-corner styling assumes one
        // row, so the wrapped row's end buttons get their own rounding.
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        justifyContent: 'center',
        rowGap: 1,
        '& .MuiButton-root': {
          py: 0.5,
          // 44px hit area (MOBILE_UI_PLAN §2) — these are icon-only toolbar
          // buttons, easy to undershoot once py is trimmed for the wrap.
          minWidth: 44,
          minHeight: 44,
        }
      }}
    >
      <Tooltip title="Bold">
        <Button
          onClick={() => editor.chain().focus().toggleBold().run()}
          variant={editor.isActive('bold') ? 'contained' : 'outlined'}
        >
          <FormatBold />
        </Button>
      </Tooltip>
      <Tooltip title="Italic">
        <Button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          variant={editor.isActive('italic') ? 'contained' : 'outlined'}
        >
          <FormatItalic />
        </Button>
      </Tooltip>
      <Tooltip title="Underline">
        <Button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          variant={editor.isActive('underline') ? 'contained' : 'outlined'}
        >
          <FormatUnderlined />
        </Button>
      </Tooltip>
      <Tooltip title="Code">
        <Button
          onClick={() => editor.chain().focus().toggleCode().run()}
          variant={editor.isActive('code') ? 'contained' : 'outlined'}
        >
          <Code />
        </Button>
      </Tooltip>
      <Tooltip title="Quote">
        <Button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          variant={editor.isActive('blockquote') ? 'contained' : 'outlined'}
        >
          <FormatQuote />
        </Button>
      </Tooltip>
      <Tooltip title="Bullet List">
        <Button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          variant={editor.isActive('bulletList') ? 'contained' : 'outlined'}
        >
          <FormatListBulleted />
        </Button>
      </Tooltip>
      <Tooltip title="Numbered List">
        <Button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          variant={editor.isActive('orderedList') ? 'contained' : 'outlined'}
        >
          <FormatListNumbered />
        </Button>
      </Tooltip>
      <Tooltip title="Link">
        <Button
          onClick={addLink}
          variant={editor.isActive('link') ? 'contained' : 'outlined'}
        >
          <LinkIcon />
        </Button>
      </Tooltip>
    </ButtonGroup>
  );
};

const RichTextEditor = ({ content = '', setContent = () => {}, isLoading = false, fontSize = 14 }) => {
  const lastSavedContent = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
    ],
    content: content,
    // ProseMirror puts role="textbox" on its contenteditable div; without a
    // name that is an `aria-input-field-name` violation, and a screen reader
    // lands in an unnamed edit field.
    editorProps: {
      attributes: {
        'aria-label': 'Note body',
      },
    },
    // Report on every keystroke, not only on blur.
    //
    // This editor used to report ONLY in `onBlur`, which made it the odd one
    // out — MarkdownEditor and CodeEditor both call `setContent` per keystroke
    // — and had two consequences on the page above it: the 2s autosave never
    // armed while the caret was in the body (nothing had set `dirty`), and
    // Cmd/Ctrl+S, which does not blur, persisted the PRE-EDIT html. Writing a
    // rich-text note and hitting save was a no-op.
    //
    // `lastSavedContent` is updated first, so the sync effect below sees no
    // difference when the new value comes back down as a prop and never calls
    // `setContent()` on the editor — which is what would move the caret.
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html !== lastSavedContent.current) {
        lastSavedContent.current = html;
        setContent(html);
      }
    },
    onBlur: ({ editor }) => {
      const html = editor.getHTML();
      if (html !== lastSavedContent.current) {
        lastSavedContent.current = html;
        setContent(html);
      }
    },
    editable: !isLoading,
  });

  // Update editor content when prop changes and differs from current content
  useEffect(() => {
    if (editor && content !== lastSavedContent.current) {
      editor.commands.setContent(content, false);
      lastSavedContent.current = content;
    }
  }, [content, editor]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  if (!editor) {
    return (
      <Box
        sx={{
          width: '99%',
          height: '100%',
          bgcolor: 'transparent',
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        Loading editor...
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '99%',
        height: '100%',
        bgcolor: 'transparent',
        p: 1.5,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <MenuBar editor={editor} />
      {/* Fills whatever height the flex chain above (NoteShell's content
          zone, ultimately the shell's own 100dvh) actually gives this column
          — no viewport-relative magic number to fight it. */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', '& .ProseMirror': { fontSize: `${fontSize}px` } }}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};

export default RichTextEditor;