import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Box } from '@mui/material';
import EditorToolbar, { ToolButton, ToolSeparator } from './EditorToolbar';
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

const TOOL_GROUPS = [
  [
    { label: 'Bold', Icon: FormatBold, mark: 'bold', run: (e) => e.chain().focus().toggleBold().run() },
    { label: 'Italic', Icon: FormatItalic, mark: 'italic', run: (e) => e.chain().focus().toggleItalic().run() },
    { label: 'Underline', Icon: FormatUnderlined, mark: 'underline', run: (e) => e.chain().focus().toggleUnderline().run() },
  ],
  [
    { label: 'Code', Icon: Code, mark: 'code', run: (e) => e.chain().focus().toggleCode().run() },
    { label: 'Quote', Icon: FormatQuote, mark: 'blockquote', run: (e) => e.chain().focus().toggleBlockquote().run() },
  ],
  [
    { label: 'Bullet List', Icon: FormatListBulleted, mark: 'bulletList', run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: 'Numbered List', Icon: FormatListNumbered, mark: 'orderedList', run: (e) => e.chain().focus().toggleOrderedList().run() },
  ],
];

/**
 * The formatting toolbar (EditorToolbar): a sticky strip on the text column
 * on desktop, docked above the keyboard on a phone. An active mark is
 * highlighted — highlighter fill, graphite ink.
 */
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
    <EditorToolbar label="Formatting">
      {TOOL_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <ToolSeparator />}
          {group.map((tool) => {
            const { label, mark, run } = tool;
            const Glyph = tool.Icon;
            return (
              <ToolButton key={label} label={label} active={editor.isActive(mark)} onClick={() => run(editor)}>
                <Glyph />
              </ToolButton>
            );
          })}
        </React.Fragment>
      ))}
      <ToolSeparator />
      <ToolButton label="Link" active={editor.isActive('link')} onClick={addLink}>
        <LinkIcon />
      </ToolButton>
    </EditorToolbar>
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
          width: '100%',
          minHeight: 200,
          bgcolor: 'transparent',
          color: 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        Loading editor...
      </Box>
    );
  }

  // No scroll box of its own: the page (NoteShell) scrolls, which is what
  // lets the toolbar stick and the title scroll away. The ProseMirror
  // surface has no side padding so its text sits on the title's edge.
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
      <MenuBar editor={editor} />
      <Box
        sx={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          '& > div': { flex: '1 0 auto', display: 'flex', flexDirection: 'column' },
          '& .ProseMirror': {
            flex: '1 0 auto',
            fontSize: `${fontSize}px`,
            px: 0,
            py: '4px',
            minHeight: '40vh',
            lineHeight: 1.7,
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};

export default RichTextEditor;
