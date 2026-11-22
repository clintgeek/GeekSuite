/**
 * InkToolbar.jsx — the day page's own small toolbar (tldraw's UI is hidden).
 *
 * Cut down from apps/notegeek/frontend/src/components/editors/DrawingToolbar.jsx:
 * Pen, Eraser, Lasso, Undo, Redo, "Finger draws", and Page (the paper and
 * the template, PageMenu.jsx); "Fit" appears only while the page is zoomed in.
 * The Lenovo pen never reports a held button, so every tool is a button here.
 * Palm rejection is NoteGeek's (palmTouch.js).
 *
 * It must render INSIDE <Tldraw>: useEditor() only resolves in tldraw's context.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, SvgIcon } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FitScreenOutlinedIcon from '@mui/icons-material/FitScreenOutlined';
import PageMenu from './PageMenu';
import { isPalmTouch } from './palmTouch';

// Material Symbols "ink_eraser" (Apache 2.0); MUI's icon set has no eraser.
const EraserIcon = (props) => (
  <SvgIcon viewBox="0 -960 960 960" {...props}>
    <path d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z" />
  </SvgIcon>
);

// A dashed loop with a tail: the lasso. Drawn here; MUI has none.
const LassoIcon = (props) => (
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <ellipse cx="12" cy="9.5" rx="8.5" ry="6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3.2 2.2" strokeLinecap="round" />
    <path d="M7.6 14.9c-1.5 1.7-1.6 3.9.4 5.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </SvgIcon>
);

function BarButton({ label, testId, pressed, onClick, disabled = false, children, ...rest }) {
  const toggle = pressed !== undefined;
  return (
    <IconButton
      aria-label={label}
      title={label}
      aria-pressed={toggle ? (pressed ? 'true' : 'false') : undefined}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      {...rest}
      sx={{
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        borderRadius: 2,
        color: pressed ? 'primary.contrastText' : 'text.primary',
        bgcolor: pressed ? 'primary.main' : 'transparent',
        '&:hover': { bgcolor: pressed ? 'primary.dark' : 'action.hover' },
        '&.Mui-disabled': { color: 'text.disabled' },
        '&.Mui-focusVisible, &:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      {children}
    </IconButton>
  );
}

const Divider = () => <Box aria-hidden sx={{ width: '1px', height: 24, bgcolor: 'divider', mx: 0.5, flexShrink: 0 }} />;

/**
 * @param {object} props
 * @param {'pen'|'eraser'|'lasso'} props.tool
 * @param {(tool: string) => void} props.onTool
 * @param {boolean} props.fingerDraws        the writer's override is on
 * @param {(on: boolean) => void} props.onFingerDrawsChange
 * @param {boolean} props.penMode            fingers do not draw right now (palm rejection applies)
 * @param {string} props.paper               the paper on screen (pageTemplate.js PAPER_CHOICES)
 * @param {string} props.sheet               the template on screen, placed or previewed (SHEET_CHOICES)
 * @param {{paper: string, sheet: string}} props.deviceDefault  this device's page for new days
 * @param {(id: string) => void} props.onPaper
 * @param {(id: string) => void} props.onSheet
 * @param {(page: {paper: string, sheet: string}) => void} props.onDeviceDefault
 * @param {boolean} props.zoomed             the page is zoomed in
 * @param {() => void} props.onFit           back to the whole width
 */
export default function InkToolbar({
  tool, onTool, fingerDraws, onFingerDrawsChange, penMode,
  paper, sheet, deviceDefault, onPaper, onSheet, onDeviceDefault, zoomed = false, onFit,
}) {
  const [pageAnchor, setPageAnchor] = useState(null);
  const editor = useEditor();
  const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor]);
  const canRedo = useValue('can redo', () => editor.getCanRedo(), [editor]);

  // A pen near the screen (hovering or writing) means a touch on the bar is
  // the hand resting to write.
  const lastPenAtRef = useRef(0);
  useEffect(() => {
    const seen = (e) => { if (e.pointerType === 'pen') lastPenAtRef.current = Date.now(); };
    const opts = { capture: true, passive: true };
    window.addEventListener('pointermove', seen, opts);
    window.addEventListener('pointerdown', seen, opts);
    return () => {
      window.removeEventListener('pointermove', seen, opts);
      window.removeEventListener('pointerdown', seen, opts);
    };
  }, []);
  const palmUntilRef = useRef(0);
  const onPointerDownCapture = useCallback((e) => {
    if (!isPalmTouch(e, { penMode, lastPenAt: lastPenAtRef.current })) return;
    e.preventDefault();
    e.stopPropagation();
    palmUntilRef.current = Date.now() + 800;
  }, [penMode]);
  const onClickCapture = useCallback((e) => {
    if (Date.now() >= palmUntilRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <Box
      role="toolbar"
      aria-label="Ink tools"
      aria-orientation="horizontal"
      data-testid="ink-toolbar"
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
      sx={{
        position: 'absolute',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        maxWidth: 'calc(100% - 16px)',
        '& > *': { flexShrink: 0 },
        bgcolor: 'background.paper',
        color: 'text.primary',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        p: 0.5,
        zIndex: 100,
        touchAction: 'manipulation',
      }}
    >
      <BarButton label="Pen" testId="ink-tool-pen" pressed={tool === 'pen'} onClick={() => onTool('pen')}>
        <EditOutlinedIcon fontSize="small" />
      </BarButton>
      <BarButton label="Eraser" testId="ink-tool-eraser" pressed={tool === 'eraser'} onClick={() => onTool('eraser')}>
        <EraserIcon fontSize="small" />
      </BarButton>
      <BarButton label="Circle to make a task" testId="ink-tool-lasso" pressed={tool === 'lasso'} onClick={() => onTool('lasso')}>
        <LassoIcon fontSize="small" />
      </BarButton>
      <Divider />
      <BarButton label="Undo" testId="ink-undo" onClick={() => editor.undo()} disabled={!canUndo}>
        <UndoIcon fontSize="small" />
      </BarButton>
      <BarButton label="Redo" testId="ink-redo" onClick={() => editor.redo()} disabled={!canRedo}>
        <RedoIcon fontSize="small" />
      </BarButton>
      <Divider />
      <BarButton label="Finger draws" testId="ink-finger-draws" pressed={Boolean(fingerDraws)} onClick={() => onFingerDrawsChange(!fingerDraws)}>
        <TouchAppOutlinedIcon fontSize="small" />
      </BarButton>
      <BarButton
        label="Page"
        testId="ink-page"
        aria-haspopup="menu"
        aria-expanded={pageAnchor ? 'true' : 'false'}
        onClick={(e) => setPageAnchor(e.currentTarget)}
      >
        <ArticleOutlinedIcon fontSize="small" />
      </BarButton>
      {zoomed ? (
        <BarButton label="Fit page to width" testId="ink-fit" onClick={onFit}>
          <FitScreenOutlinedIcon fontSize="small" />
        </BarButton>
      ) : null}
      <PageMenu
        anchorEl={pageAnchor}
        onClose={() => setPageAnchor(null)}
        paper={paper}
        sheet={sheet}
        deviceDefault={deviceDefault}
        onPaper={onPaper}
        onSheet={onSheet}
        onDeviceDefault={onDeviceDefault}
      />
    </Box>
  );
}
