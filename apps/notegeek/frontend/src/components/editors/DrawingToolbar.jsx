/**
 * The sketch editor's toolbar — one floating bar at every size.
 *
 * It began as the phone toolbar (Move, Write, Pen, Undo, Fullscreen). Chef
 * preferred it to tldraw's own UI on tablet and desktop too (2026-11-14), but
 * with all the tools there: so from 720px up the same bar carries every
 * tldraw tool, with the shape family and the zoom controls each collapsed
 * behind one button. Phones keep the short bar.
 *
 * It must render INSIDE <Tldraw>: useEditor() and useTools() only resolve in
 * tldraw's editor and UI context.
 */
import React, { useEffect, useState } from 'react';
import { Box, IconButton, Popover, SvgIcon, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import {
    useEditor, useValue, useTools,
    DefaultColorStyle, DefaultSizeStyle, DefaultColorThemePalette, GeoShapeGeoStyle,
} from '@tldraw/tldraw';
import GestureOutlinedIcon from '@mui/icons-material/GestureOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import NearMeOutlinedIcon from '@mui/icons-material/NearMeOutlined';
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import CallMadeIcon from '@mui/icons-material/CallMade';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CropFreeIcon from '@mui/icons-material/CropFree';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { graphiteTokens } from '../../theme/tokens';

/** The width from which the bar carries every tool (tablet portrait and up). */
export const FULL_TOOLBAR_QUERY = '(min-width: 720px)';

// Material Symbols "ink_eraser" (Apache 2.0); MUI's icon set has no eraser.
const EraserIcon = (props) => (
    <SvgIcon viewBox="0 -960 960 960" {...props}>
        <path d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z" />
    </SvgIcon>
);
const DiamondIcon = (props) => <CropSquareIcon {...props} sx={{ transform: 'rotate(45deg) scale(0.85)' }} />;

// Pen styles for the drawing toolbar. tldraw's own style panel is hidden (it
// covered the canvas on phones, Chef 2026-09-27), so this picker is the only
// way to change the pen. White is left out: it's invisible on the page.
const PEN_COLORS = ['black', 'grey', 'blue', 'light-blue', 'violet', 'light-violet', 'green', 'light-green', 'yellow', 'orange', 'red', 'light-red'];
// "Fine" is finer than tldraw's smallest size: see utils/finePen.js.
const PEN_SIZES = [
    { value: 'fine', label: 'Fine', dot: 3 },
    { value: 's', label: 'Small', dot: 5 },
    { value: 'm', label: 'Medium', dot: 8 },
    { value: 'l', label: 'Large', dot: 11 },
    { value: 'xl', label: 'Extra large', dot: 15 },
];
const colorName = (c) => c.replace('-', ' ');

// The shape family, behind one button. ids are tldraw's tool ids (useTools):
// geo shapes by their geo style, plus arrow, line and frame.
const SHAPES = [
    { id: 'rectangle', label: 'Rectangle', Icon: CropSquareIcon },
    { id: 'ellipse', label: 'Ellipse', Icon: CircleOutlinedIcon },
    { id: 'triangle', label: 'Triangle', Icon: ChangeHistoryIcon },
    { id: 'diamond', label: 'Diamond', Icon: DiamondIcon },
    { id: 'star', label: 'Star', Icon: StarOutlineIcon },
    { id: 'cloud', label: 'Cloud', Icon: CloudOutlinedIcon },
    { id: 'heart', label: 'Heart', Icon: FavoriteBorderIcon },
    { id: 'arrow', label: 'Arrow', Icon: CallMadeIcon },
    { id: 'line', label: 'Line', Icon: HorizontalRuleIcon },
    { id: 'frame', label: 'Frame', Icon: CropFreeIcon },
];
const SHAPE_TOOL_IDS = new Set(['geo', 'arrow', 'line', 'frame']);

function PenStylePicker({ editor, fine, onFineChange }) {
    const theme = useTheme();
    const palette = DefaultColorThemePalette[theme.palette.mode === 'dark' ? 'darkMode' : 'lightMode'];
    const color = useValue('pen color', () => editor.getStyleForNextShape(DefaultColorStyle), [editor]);
    const size = useValue('pen size', () => editor.getStyleForNextShape(DefaultSizeStyle), [editor]);
    const [anchor, setAnchor] = useState(null);
    const current = size === 's' && fine ? 'fine' : size;
    const dot = (PEN_SIZES.find((s) => s.value === current) || PEN_SIZES[0]).dot;

    const chooseSize = (value) => {
        // Fine is size 's' plus a scale on new strokes; everything else is
        // tldraw's own size and turns Fine off.
        onFineChange(value === 'fine');
        choose(DefaultSizeStyle, value === 'fine' ? 's' : value);
    };

    const choose = (style, value) => {
        // Restyle what's selected, and every stroke from now on.
        editor.setStyleForSelectedShapes(style, value);
        editor.setStyleForNextShapes(style, value);
        if (editor.getCurrentToolId() === 'hand') editor.setCurrentTool('draw');
    };

    const swatch = {
        minWidth: 44, minHeight: 44, width: 44, height: 44,
        borderRadius: 2, border: '2px solid transparent',
    };

    return (
        <>
            <Tooltip title="Pen colour and size" placement="top">
                <IconButton
                    aria-label="Pen colour and size"
                    aria-haspopup="dialog"
                    aria-expanded={anchor ? 'true' : 'false'}
                    size="small"
                    onClick={(e) => setAnchor(e.currentTarget)}
                >
                    <Box
                        aria-hidden
                        sx={{
                            width: dot + 4, height: dot + 4, borderRadius: '50%',
                            bgcolor: palette[color]?.solid ?? 'text.primary',
                            boxShadow: (t) => `0 0 0 1px ${t.palette.divider}`,
                        }}
                    />
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{ paper: { role: 'dialog', 'aria-label': 'Pen colour and size', sx: { p: 3, mb: 2 } } }}
            >
                <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                    Size
                </Typography>
                <Box role="group" aria-label="Pen size" sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    {PEN_SIZES.map((s) => (
                        <IconButton
                            key={s.value}
                            aria-label={`Size: ${s.label}`}
                            aria-pressed={current === s.value ? 'true' : 'false'}
                            onClick={() => chooseSize(s.value)}
                            sx={{ ...swatch, borderColor: current === s.value ? 'primary.main' : 'divider' }}
                        >
                            <Box aria-hidden sx={{ width: s.dot, height: s.dot, borderRadius: '50%', bgcolor: 'text.primary' }} />
                        </IconButton>
                    ))}
                </Box>
                <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                    Colour
                </Typography>
                <Box role="group" aria-label="Pen colour" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 44px)', gap: 1 }}>
                    {PEN_COLORS.map((c) => (
                        <IconButton
                            key={c}
                            aria-label={`Colour: ${colorName(c)}`}
                            aria-pressed={color === c ? 'true' : 'false'}
                            onClick={() => choose(DefaultColorStyle, c)}
                            sx={{ ...swatch, borderColor: color === c ? 'primary.main' : 'transparent' }}
                        >
                            <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: palette[c]?.solid }} />
                        </IconButton>
                    ))}
                </Box>
            </Popover>
        </>
    );
}

/** One tool button. The active tool is highlighted (Graphite): ink on highlighter. */
function ToolButton({ label, active = false, onClick, disabled = false, children, sx, ...rest }) {
    const hl = graphiteTokens(useTheme());
    return (
        <Tooltip title={label} placement="top">
            {/* span: a disabled button still gets its tooltip */}
            <span>
                <IconButton
                    aria-label={label}
                    aria-pressed={active ? 'true' : undefined}
                    size="small"
                    onClick={onClick}
                    disabled={disabled}
                    sx={{
                        bgcolor: active ? hl.hl : 'transparent',
                        color: active ? hl.onHl : 'text.secondary',
                        opacity: disabled ? 0.3 : 1,
                        '&:hover': { bgcolor: active ? hl.hl : 'action.hover' },
                        ...sx,
                    }}
                    {...rest}
                >
                    {children}
                </IconButton>
            </span>
        </Tooltip>
    );
}

const Divider = () => <Box aria-hidden sx={{ width: '1px', height: 24, bgcolor: 'divider', mx: 0.5, flexShrink: 0 }} />;

/** A button that opens a small grid of more buttons above the bar. */
function ToolMenu({ label, active, icon, children }) {
    const [anchor, setAnchor] = useState(null);
    const close = () => setAnchor(null);
    return (
        <>
            <ToolButton
                label={label}
                active={active}
                aria-haspopup="dialog"
                aria-expanded={anchor ? 'true' : 'false'}
                onClick={(e) => setAnchor(e.currentTarget)}
            >
                {icon}
            </ToolButton>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={close}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{ paper: { role: 'dialog', 'aria-label': label, sx: { p: 2, mb: 2 } } }}
            >
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 44px)', gap: 1 }}>
                    {typeof children === 'function' ? children(close) : children}
                </Box>
            </Popover>
        </>
    );
}

const menuItemSx = { width: 44, height: 44 };

export default function DrawingToolbar({ containerRef, onFullscreenChange, fine, onFineChange }) {
    const editor = useEditor();
    const tools = useTools();
    const full = useMediaQuery(FULL_TOOLBAR_QUERY);
    const currentTool = useValue('current tool', () => editor.getCurrentToolId(), [editor]);
    const geo = useValue('geo style', () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor]);
    const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor]);
    const canRedo = useValue('can redo', () => editor.getCanRedo(), [editor]);
    const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor]);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const isNowFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isNowFullscreen);
            if (onFullscreenChange) onFullscreenChange(isNowFullscreen);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [onFullscreenChange]);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement && containerRef?.current) {
                await containerRef.current.requestFullscreen();
            } else if (document.exitFullscreen) {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.warn('Fullscreen not supported:', err);
        }
    };

    // tldraw's own tool actions (they set styles, open the image picker, …);
    // a plain setCurrentTool if the id is missing.
    const select = (id) => (tools[id] ? tools[id].onSelect('toolbar') : editor.setCurrentTool(id));
    const isShapeActive = (id) => (currentTool === 'geo' ? geo === id : currentTool === id);
    const ActiveShapeIcon = (SHAPE_TOOL_IDS.has(currentTool) && SHAPES.find((s) => isShapeActive(s.id))?.Icon) || CategoryOutlinedIcon;

    return (
        <Box
            role="toolbar"
            aria-label="Drawing tools"
            sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                maxWidth: 'calc(100% - 16px)',
                bgcolor: 'background.paper',
                borderRadius: 3,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                px: 1.5,
                py: 0.75,
                zIndex: 100,
                border: '1px solid',
                borderColor: 'divider',
            }}
        >
            {full && (
                <ToolButton label="Select" active={currentTool === 'select'} onClick={() => select('select')}>
                    <NearMeOutlinedIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
                </ToolButton>
            )}
            <ToolButton label="Move" active={currentTool === 'hand'} onClick={() => select('hand')}>
                <PanToolOutlinedIcon fontSize="small" />
            </ToolButton>
            <ToolButton label="Write" active={currentTool === 'draw'} onClick={() => select('draw')}>
                <GestureOutlinedIcon fontSize="small" />
            </ToolButton>

            {full && (
                <>
                    <ToolButton label="Highlighter" active={currentTool === 'highlight'} onClick={() => select('highlight')}>
                        <BorderColorOutlinedIcon fontSize="small" />
                    </ToolButton>
                    <ToolButton label="Eraser" active={currentTool === 'eraser'} onClick={() => select('eraser')}>
                        <EraserIcon fontSize="small" />
                    </ToolButton>
                    <ToolMenu label="Shapes" active={SHAPE_TOOL_IDS.has(currentTool)} icon={<ActiveShapeIcon fontSize="small" />}>
                        {(close) => SHAPES.map((shape) => (
                            <ToolButton
                                key={shape.id}
                                label={shape.label}
                                active={isShapeActive(shape.id)}
                                onClick={() => { select(shape.id); close(); }}
                                sx={menuItemSx}
                            >
                                <shape.Icon fontSize="small" />
                            </ToolButton>
                        ))}
                    </ToolMenu>
                    <ToolButton label="Text" active={currentTool === 'text'} onClick={() => select('text')}>
                        <TextFieldsIcon fontSize="small" />
                    </ToolButton>
                    <ToolButton label="Sticky note" active={currentTool === 'note'} onClick={() => select('note')}>
                        <StickyNote2OutlinedIcon fontSize="small" />
                    </ToolButton>
                    <ToolButton label="Insert image" onClick={() => select('asset')}>
                        <ImageOutlinedIcon fontSize="small" />
                    </ToolButton>
                </>
            )}

            {/* Pen colour and size */}
            <PenStylePicker editor={editor} fine={fine} onFineChange={onFineChange} />

            <Divider />

            <ToolButton label="Undo" onClick={() => editor.undo()} disabled={!canUndo}>
                <UndoIcon fontSize="small" />
            </ToolButton>
            {full && (
                <ToolButton label="Redo" onClick={() => editor.redo()} disabled={!canRedo}>
                    <RedoIcon fontSize="small" />
                </ToolButton>
            )}

            <Divider />

            {full && (
                <ToolMenu label={`Zoom, ${Math.round(zoom * 100)}%`} icon={<ZoomInIcon fontSize="small" />}>
                    {(close) => [
                        <ToolButton key="out" label="Zoom out" onClick={() => editor.zoomOut()} sx={menuItemSx}>
                            <ZoomOutIcon fontSize="small" />
                        </ToolButton>,
                        <ToolButton key="in" label="Zoom in" onClick={() => editor.zoomIn()} sx={menuItemSx}>
                            <ZoomInIcon fontSize="small" />
                        </ToolButton>,
                        <ToolButton key="100" label="Zoom to 100%" onClick={() => { editor.resetZoom(); close(); }} sx={{ ...menuItemSx, fontSize: 12, fontWeight: 700 }}>
                            1:1
                        </ToolButton>,
                        <ToolButton key="fit" label="Zoom to fit" onClick={() => { editor.zoomToFit(); close(); }} sx={menuItemSx}>
                            <CropFreeIcon fontSize="small" />
                        </ToolButton>,
                    ]}
                </ToolMenu>
            )}

            <ToolButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </ToolButton>
        </Box>
    );
}
