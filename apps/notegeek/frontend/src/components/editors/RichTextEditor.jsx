import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import { glow, stampFill, stampInk, surfaces, tapTarget44 } from '../../theme/tokens';
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
 * The formatting toolbar: one slim row on the text column's left edge, not a
 * boxed button group centred over the page. It is `position: sticky` against
 * NoteShell's page scroller, so it stays in reach while the title scrolls
 * away. Icon buttons are 32px on desktop and 44px on phones (MOBILE_UI_PLAN
 * §2); an active mark is inked in brick.
 */
const MenuBar = ({ editor }) => {
  const theme = useTheme();
  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const ink = stampInk(theme).ink;
  const buttonSx = (active) => ({
    width: 32,
    height: 32,
    // The suite theme floors every IconButton at 44px; the desktop toolbar
    // is a slim strip, so it opts down to 32 above `md` only.
    minWidth: 32,
    minHeight: 32,
    borderRadius: '4px',
    color: active ? ink : 'text.secondary',
    bgcolor: active ? stampFill(theme, ink) : 'transparent',
    [theme.breakpoints.down('md')]: { ...tapTarget44 },
    '&:hover': { bgcolor: active ? stampFill(theme, ink) : glow(theme).soft, color: active ? ink : 'text.primary' },
    '& svg': { fontSize: 18 },
  });

  const Separator = () => (
    <Box
      aria-hidden
      sx={{ width: '1px', height: 16, bgcolor: 'divider', mx: '6px', display: { xs: 'none', md: 'block' } }}
    />
  );

  return (
    <Box
      role="toolbar"
      aria-label="Formatting"
      data-editor-toolbar
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: { xs: 0, md: '2px' },
        py: '4px',
        mb: '16px',
        // Flush with the text column: the first button's glyph, not its
        // padding, lines up with the title above.
        ml: { xs: 0, md: '-7px' },
        bgcolor: surfaces(theme).elevated,
        borderBottom: `1px solid ${theme.palette.divider}`,
        flexShrink: 0,
      }}
    >
      {TOOL_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <Separator />}
          {group.map((tool) => {
            const { label, mark, run } = tool;
            const Glyph = tool.Icon;
            const active = editor.isActive(mark);
            return (
              <Tooltip key={label} title={label}>
                <IconButton
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => run(editor)}
                  sx={buttonSx(active)}
                >
                  <Glyph />
                </IconButton>
              </Tooltip>
            );
          })}
        </React.Fragment>
      ))}
      <Separator />
      <Tooltip title="Link">
        <IconButton
          aria-label="Link"
          aria-pressed={editor.isActive('link')}
          onClick={addLink}
          sx={buttonSx(editor.isActive('link'))}
        >
          <LinkIcon />
        </IconButton>
      </Tooltip>
    </Box>
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
