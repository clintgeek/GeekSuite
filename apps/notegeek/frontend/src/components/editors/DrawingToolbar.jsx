/**
 * The sketch editor's toolbar — one floating bar at every size.
 *
 * It began as the phone toolbar (Move, Write, Pen, Undo, Fullscreen; Paper
 * joined 2026-11-14). Chef
 * preferred it to tldraw's own UI on tablet and desktop too (2026-11-14), but
 * with all the tools there: so from 720px up the same bar carries every
 * tldraw tool, with the shape family and the zoom controls each collapsed
 * behind one button. Phones keep the short bar.
 *
 * It must render INSIDE <Tldraw>: useEditor() and useTools() only resolve in
 * tldraw's editor and UI context.
 *
 * Review 2026-11 (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md):
 *   - 2.5 (D2): the short bar gains Eraser and a More popover (Select, Redo,
 *     Highlighter, Zoom to fit, and the rest of the tools).
 *   - 2.6: full or short is chosen by the CONTAINER's length (ResizeObserver),
 *     not the viewport: from 900px a 220px sidebar takes room, and the last
 *     buttons fell off. What doesn't fit is in More.
 *   - 2.4: the bar sits on any edge (bottom / top / left / right, per device,
 *     in More), and in pen mode a resting palm can't press it.
 *   - 2.2: every picker and tooltip portals into the sketch's container, so
 *     they show in fullscreen.
 *   - 2.3: "Finger draws" (in More) turns palm rejection off on this device.
 *   - 2.11: the bar clears the gesture bar (safe-area insets); the pen's ink
 *     swatches sit on the paper's colour, so dark ink shows in dark mode.
 *   - 2.12: a strip of the last three pens; Share as image.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Box, Button, FormControlLabel, IconButton, Popover, SvgIcon, Switch, ToggleButton, ToggleButtonGroup,
    Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
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
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import IosShareIcon from '@mui/icons-material/IosShare';
import { graphiteTokens } from '../../theme/tokens';
import { PaperPicker } from './Paper';
import { usePaper } from './usePaper';
import { popoverOrigins, tooltipPlacement, useSketchPortal } from './sketchPortal';
import { BAR_POSITIONS, pushRecentPen, readRecentPens } from '../../utils/penPrefs';

/**
 * Before the bar can be measured (jsdom, the first frame): the viewport query
 * the bar used to use (tablet portrait and up).
 */
export const FULL_TOOLBAR_QUERY = '(min-width: 720px)';
/** The full bar is ~760px of buttons: it needs this much container, along its edge. */
export const FULL_BAR_MIN = 800;

/**
 * A touch on the bar in pen mode is a palm when a pen was near a moment ago
 * (resting the hand to write), or the contact is wide. A deliberate fingertip
 * with the pen put down still works, so the bar is never locked out.
 */
export const PALM_PEN_RECENT_MS = 1500;
export const PALM_CONTACT_PX = 24;
export function isPalmTouch(e, { penMode, lastPenAt, now = Date.now() }) {
    if (!penMode || e.pointerType !== 'touch') return false;
    if (now - (lastPenAt || 0) < PALM_PEN_RECENT_MS) return true;
    return (e.width || 0) >= PALM_CONTACT_PX || (e.height || 0) >= PALM_CONTACT_PX;
}

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

/** The pen's ink, drawn on the paper it will land on (dark ink stays visible in dark mode). */
function InkDot({ background, color, size }) {
    return (
        <Box
            aria-hidden
            sx={{
                width: size + 10, height: size + 10, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: background || 'transparent',
                boxShadow: (t) => (background ? `0 0 0 1px ${t.palette.divider}` : 'none'),
            }}
        >
            <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: color, boxShadow: (t) => (background ? 'none' : `0 0 0 1px ${t.palette.divider}`) }} />
        </Box>
    );
}

function PenStylePicker({ editor, fine, onFineChange, onToolPicked }) {
    const { container, position } = useSketchPortal();
    const origins = popoverOrigins(position);
    // tldraw's scheme, not the app's: on paper the page is light even in dark
    // mode, and the swatches must show the ink as it will look (Paper.jsx).
    const isDark = useValue('dark ink', () => editor.user.getIsDarkMode(), [editor]);
    const palette = DefaultColorThemePalette[isDark ? 'darkMode' : 'lightMode'];
    const { look } = usePaper();
    const color = useValue('pen color', () => editor.getStyleForNextShape(DefaultColorStyle), [editor]);
    const size = useValue('pen size', () => editor.getStyleForNextShape(DefaultSizeStyle), [editor]);
    const [anchor, setAnchor] = useState(null);
    const [recent, setRecent] = useState(() => readRecentPens());
    const current = size === 's' && fine ? 'fine' : size;
    const dot = (PEN_SIZES.find((s) => s.value === current) || PEN_SIZES[0]).dot;

    const apply = (style, value) => {
        // Restyle what's selected, and every stroke from now on.
        editor.setStyleForSelectedShapes(style, value);
        editor.setStyleForNextShapes(style, value);
        if (editor.getCurrentToolId() === 'hand') {
            editor.setCurrentTool('draw');
            onToolPicked?.();
        }
    };
    const remember = (pen) => setRecent(pushRecentPen(pen));

    const chooseSize = (value) => {
        // Fine is size 's' plus a scale on new strokes; everything else is
        // tldraw's own size and turns Fine off.
        onFineChange(value === 'fine');
        apply(DefaultSizeStyle, value === 'fine' ? 's' : value);
        remember({ color, size: value });
    };
    const chooseColor = (value) => {
        apply(DefaultColorStyle, value);
        remember({ color: value, size: current });
    };
    const choosePen = (pen) => {
        onFineChange(pen.size === 'fine');
        apply(DefaultSizeStyle, pen.size === 'fine' ? 's' : pen.size);
        apply(DefaultColorStyle, pen.color);
        remember(pen);
        setAnchor(null);
    };

    const swatch = {
        minWidth: 44, minHeight: 44, width: 44, height: 44,
        borderRadius: 2, border: '2px solid transparent',
    };
    const sizeLabel = (v) => (PEN_SIZES.find((s) => s.value === v) || PEN_SIZES[1]).label;
    const others = recent.filter((p) => p.color !== color || p.size !== current);

    return (
        <>
            <Tooltip title="Pen colour and size" placement={tooltipPlacement(position)} slotProps={{ popper: { container } }}>
                <IconButton
                    aria-label="Pen colour and size"
                    aria-haspopup="dialog"
                    aria-expanded={anchor ? 'true' : 'false'}
                    size="small"
                    onClick={(e) => setAnchor(e.currentTarget)}
                >
                    <InkDot background={look.background} color={palette[color]?.solid ?? 'currentColor'} size={dot + 4} />
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                container={container}
                onClose={() => setAnchor(null)}
                anchorOrigin={origins.anchorOrigin}
                transformOrigin={origins.transformOrigin}
                slotProps={{ paper: { role: 'dialog', 'aria-label': 'Pen colour and size', sx: { p: 3, ...origins.gap } } }}
            >
                {others.length ? (
                    <>
                        <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                            Recent pens
                        </Typography>
                        <Box role="group" aria-label="Recent pens" sx={{ display: 'flex', gap: 1, mb: 3 }}>
                            {others.map((p) => (
                                <IconButton
                                    key={`${p.color}|${p.size}`}
                                    aria-label={`Recent pen: ${colorName(p.color)}, ${sizeLabel(p.size)}`}
                                    onClick={() => choosePen(p)}
                                    sx={{ ...swatch, borderColor: 'divider' }}
                                >
                                    <InkDot background={look.background} color={palette[p.color]?.solid} size={(PEN_SIZES.find((s) => s.value === p.size) || PEN_SIZES[1]).dot + 4} />
                                </IconButton>
                            ))}
                        </Box>
                    </>
                ) : null}
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
                <Box
                    role="group"
                    aria-label="Pen colour"
                    sx={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 44px)', gap: 1,
                        // The swatches sit on the paper they will be drawn on:
                        // black ink on a dark popover was invisible (2.11).
                        ...(look.background ? { bgcolor: look.background, borderRadius: 2, p: 1, mx: -1 } : null),
                    }}
                >
                    {PEN_COLORS.map((c) => (
                        <IconButton
                            key={c}
                            aria-label={`Colour: ${colorName(c)}`}
                            aria-pressed={color === c ? 'true' : 'false'}
                            onClick={() => chooseColor(c)}
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
    const { container, position } = useSketchPortal();
    return (
        <Tooltip title={label} placement={tooltipPlacement(position)} slotProps={{ popper: { container } }}>
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

const Divider = ({ vertical = false }) => (
    <Box aria-hidden sx={vertical
        ? { height: '1px', width: 24, bgcolor: 'divider', my: `${DIVIDER_MARGIN}px`, flexShrink: 0 }
        : { width: '1px', height: 24, bgcolor: 'divider', mx: `${DIVIDER_MARGIN}px`, flexShrink: 0 }}
    />
);

/**
 * The bar's own chrome along its edge, in px: the gap between buttons and the
 * padding at each end. The SHORT bar has none to spare: its eight 44px
 * buttons are 352px of a 390px phone, and with the roomy bar's gaps and
 * padding it came to 386px in a 374px bar, so Fullscreen hung off the right
 * edge of the screen (found by the harness, 2026-11-15). The full bar, which
 * only shows where there is 800px of room, keeps its air.
 */
export const DIVIDER_MARGIN = 2;
export const SHORT_BAR_BUTTONS = 8;
export const SHORT_BAR_DIVIDERS = 2;
/** The bar keeps this much clear of the container's edges (maxWidth below). */
export const BAR_EDGE_MARGIN = 16;
export const barChrome = (full) => (full ? { gap: 2, pad: 6 } : { gap: 0, pad: 4 });
/** How wide the short bar is with 44px buttons: chrome, dividers, border and all. */
export const shortBarWidth = (button = 44) => {
    const { gap, pad } = barChrome(false);
    const items = SHORT_BAR_BUTTONS + SHORT_BAR_DIVIDERS;
    return SHORT_BAR_BUTTONS * button
        + SHORT_BAR_DIVIDERS * (1 + 2 * DIVIDER_MARGIN)
        + (items - 1) * gap
        + 2 * pad
        + 2; // the 1px border
};

/** A button that opens a small grid of more buttons, away from the bar. */
function ToolMenu({ label, active, icon, children, columns = 5 }) {
    const [anchor, setAnchor] = useState(null);
    const { container, position } = useSketchPortal();
    const origins = popoverOrigins(position);
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
                container={container}
                onClose={close}
                anchorOrigin={origins.anchorOrigin}
                transformOrigin={origins.transformOrigin}
                slotProps={{ paper: { role: 'dialog', 'aria-label': label, sx: { p: 2, ...origins.gap } } }}
            >
                {typeof children === 'function' ? children(close) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 44px)`, gap: 1 }}>{children}</Box>
                )}
            </Popover>
        </>
    );
}

const menuItemSx = { width: 44, height: 44 };
const grid = (columns) => ({ display: 'grid', gridTemplateColumns: `repeat(${columns}, 44px)`, gap: 1 });
const POSITION_LABELS = { bottom: 'Bottom', top: 'Top', left: 'Left', right: 'Right' };

/** How much room the bar has along its edge: the container, measured. */
function useBarRoom(containerRef, vertical) {
    const fallbackFull = useMediaQuery(FULL_TOOLBAR_QUERY);
    const [room, setRoom] = useState(0);
    useEffect(() => {
        const el = containerRef?.current;
        if (!el) return undefined;
        const measure = (rect = el.getBoundingClientRect()) => setRoom(Math.round(vertical ? rect.height : rect.width));
        measure();
        if (typeof ResizeObserver !== 'function') return undefined;
        const ro = new ResizeObserver((entries) => {
            const r = entries?.[0]?.contentRect;
            measure(r && (r.width || r.height) ? r : undefined);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [containerRef, vertical]);
    // Not laid out yet (or jsdom): the viewport's answer until it is.
    return room > 0 ? room >= FULL_BAR_MIN : fallbackFull;
}

export default function DrawingToolbar({
    containerRef, onFullscreenChange, fine, onFineChange,
    position = 'bottom', onPositionChange, fingerDraws = false, onFingerDrawsChange,
    onToolPicked, onShareImage,
}) {
    const editor = useEditor();
    const tools = useTools();
    const vertical = position === 'left' || position === 'right';
    const full = useBarRoom(containerRef, vertical);
    const currentTool = useValue('current tool', () => editor.getCurrentToolId(), [editor]);
    const geo = useValue('geo style', () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor]);
    const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor]);
    const canRedo = useValue('can redo', () => editor.getCanRedo(), [editor]);
    const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor]);
    const penMode = useValue('pen mode', () => Boolean(editor.getInstanceState?.()?.isPenMode), [editor]);
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
    const select = (id) => {
        onToolPicked?.();
        return tools[id] ? tools[id].onSelect('toolbar') : editor.setCurrentTool(id);
    };
    const isShapeActive = (id) => (currentTool === 'geo' ? geo === id : currentTool === id);
    const ActiveShapeIcon = (SHAPE_TOOL_IDS.has(currentTool) && SHAPES.find((s) => isShapeActive(s.id))?.Icon) || CategoryOutlinedIcon;

    const shapesMenu = (
        <ToolMenu label="Shapes" active={SHAPE_TOOL_IDS.has(currentTool)} icon={<ActiveShapeIcon fontSize="small" />}>
            {(close) => (
                <Box sx={grid(5)}>
                    {SHAPES.map((shape) => (
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
                </Box>
            )}
        </ToolMenu>
    );

    const moreMenu = (
        <ToolMenu label="More" icon={<MoreHorizIcon fontSize="small" />}>
            {(close) => (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 5 * 44 + 4 * 4 }}>
                    {!full ? (
                        <Box role="group" aria-label="More tools" sx={grid(5)}>
                            <ToolButton label="Select" active={currentTool === 'select'} onClick={() => { select('select'); close(); }} sx={menuItemSx}>
                                <NearMeOutlinedIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
                            </ToolButton>
                            <ToolButton label="Redo" onClick={() => editor.redo()} disabled={!canRedo} sx={menuItemSx}>
                                <RedoIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Highlighter" active={currentTool === 'highlight'} onClick={() => { select('highlight'); close(); }} sx={menuItemSx}>
                                <BorderColorOutlinedIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Zoom to fit" onClick={() => { editor.zoomToFit(); close(); }} sx={menuItemSx}>
                                <CropFreeIcon fontSize="small" />
                            </ToolButton>
                            {shapesMenu}
                            <ToolButton label="Text" active={currentTool === 'text'} onClick={() => { select('text'); close(); }} sx={menuItemSx}>
                                <TextFieldsIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Sticky note" active={currentTool === 'note'} onClick={() => { select('note'); close(); }} sx={menuItemSx}>
                                <StickyNote2OutlinedIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Insert image" onClick={() => { select('asset'); close(); }} sx={menuItemSx}>
                                <ImageOutlinedIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Zoom in" onClick={() => editor.zoomIn()} sx={menuItemSx}>
                                <ZoomInIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Zoom out" onClick={() => editor.zoomOut()} sx={menuItemSx}>
                                <ZoomOutIcon fontSize="small" />
                            </ToolButton>
                        </Box>
                    ) : null}
                    {onShareImage ? (
                        <Button
                            startIcon={<IosShareIcon fontSize="small" />}
                            onClick={() => { close(); onShareImage(); }}
                            sx={{ textTransform: 'none', minHeight: 44, justifyContent: 'flex-start' }}
                        >
                            Share as image
                        </Button>
                    ) : null}
                    {onFingerDrawsChange ? (
                        <FormControlLabel
                            control={<Switch checked={fingerDraws} onChange={(e) => onFingerDrawsChange(e.target.checked)} />}
                            label="Finger draws"
                            sx={{ m: 0, minHeight: 44 }}
                        />
                    ) : null}
                    {onPositionChange ? (
                        <Box>
                            <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                                Toolbar on this device
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={position}
                                onChange={(_e, v) => { if (v) onPositionChange(v); }}
                                aria-label="Toolbar position"
                            >
                                {BAR_POSITIONS.map((p) => (
                                    <ToggleButton key={p} value={p} aria-label={`Toolbar: ${POSITION_LABELS[p]}`} sx={{ minHeight: 44, minWidth: 48, textTransform: 'none' }}>
                                        {POSITION_LABELS[p]}
                                    </ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                        </Box>
                    ) : null}
                </Box>
            )}
        </ToolMenu>
    );

    const safe = (side) => `calc(16px + env(safe-area-inset-${side}, 0px))`;
    const place = {
        bottom: { bottom: safe('bottom'), left: '50%', transform: 'translateX(-50%)' },
        top: { top: safe('top'), left: '50%', transform: 'translateX(-50%)' },
        left: { left: safe('left'), top: '50%', transform: 'translateY(-50%)' },
        right: { right: safe('right'), top: '50%', transform: 'translateY(-50%)' },
    }[position] || {};
    const chrome = barChrome(full);

    return (
        <Box
            role="toolbar"
            aria-label="Drawing tools"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            data-bar-position={position}
            data-bar-full={full ? 'true' : 'false'}
            onPointerDownCapture={onPointerDownCapture}
            onClickCapture={onClickCapture}
            sx={{
                position: 'absolute',
                ...place,
                display: 'flex',
                flexDirection: vertical ? 'column' : 'row',
                alignItems: 'center',
                gap: `${chrome.gap}px`,
                // Never wider (or taller) than the page it sits on. A phone
                // narrower than the short bar scrolls it rather than losing
                // its last buttons off the edge.
                ...(vertical
                    ? { maxHeight: `calc(100% - ${BAR_EDGE_MARGIN}px)`, overflowY: 'auto' }
                    : { maxWidth: `calc(100% - ${BAR_EDGE_MARGIN}px)`, overflowX: 'auto' }),
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
                '& > *': { flexShrink: 0 },
                bgcolor: 'background.paper',
                borderRadius: 3,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                px: vertical ? 0.75 : `${chrome.pad}px`,
                py: vertical ? `${chrome.pad}px` : 0.75,
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
                <ToolButton label="Highlighter" active={currentTool === 'highlight'} onClick={() => select('highlight')}>
                    <BorderColorOutlinedIcon fontSize="small" />
                </ToolButton>
            )}
            <ToolButton label="Eraser" active={currentTool === 'eraser'} onClick={() => select('eraser')}>
                <EraserIcon fontSize="small" />
            </ToolButton>
            {full && (
                <>
                    {shapesMenu}
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
            <PenStylePicker editor={editor} fine={fine} onFineChange={onFineChange} onToolPicked={onToolPicked} />
            {/* Paper colour and lines (Paper.jsx) */}
            <PaperPicker />

            <Divider vertical={vertical} />

            <ToolButton label="Undo" onClick={() => editor.undo()} disabled={!canUndo}>
                <UndoIcon fontSize="small" />
            </ToolButton>
            {full && (
                <ToolButton label="Redo" onClick={() => editor.redo()} disabled={!canRedo}>
                    <RedoIcon fontSize="small" />
                </ToolButton>
            )}

            <Divider vertical={vertical} />

            {full && (
                <ToolMenu label={`Zoom, ${Math.round(zoom * 100)}%`} icon={<ZoomInIcon fontSize="small" />}>
                    {(close) => (
                        <Box sx={grid(4)}>
                            <ToolButton label="Zoom out" onClick={() => editor.zoomOut()} sx={menuItemSx}>
                                <ZoomOutIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Zoom in" onClick={() => editor.zoomIn()} sx={menuItemSx}>
                                <ZoomInIcon fontSize="small" />
                            </ToolButton>
                            <ToolButton label="Zoom to 100%" onClick={() => { editor.resetZoom(); close(); }} sx={{ ...menuItemSx, fontSize: 12, fontWeight: 700 }}>
                                1:1
                            </ToolButton>
                            <ToolButton label="Zoom to fit" onClick={() => { editor.zoomToFit(); close(); }} sx={menuItemSx}>
                                <CropFreeIcon fontSize="small" />
                            </ToolButton>
                        </Box>
                    )}
                </ToolMenu>
            )}

            {moreMenu}

            <ToolButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </ToolButton>
        </Box>
    );
}
