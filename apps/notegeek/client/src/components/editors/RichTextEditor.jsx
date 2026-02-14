import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Box, ButtonGroup, Button, Tooltip } from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  Code,
  Link as LinkIcon
} from '@mui/icons-material';

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
        justifyContent: 'center',
        '& .MuiButton-root': {
          py: 0.5
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
          bgcolor: 'background.paper',
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
        bgcolor: 'background.paper',
        p: 1.5,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <MenuBar editor={editor} />
      <Box sx={{ flexGrow: 1, overflow: 'auto', maxHeight: 'calc(100vh - 240px)', '& .ProseMirror': { fontSize: `${fontSize}px` } }}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};

export default RichTextEditor;