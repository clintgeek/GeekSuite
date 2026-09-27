import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircularProgress, Box, useTheme, useMediaQuery, IconButton, Tooltip, Popover, Typography } from '@mui/material';
import {
    Box as TlBox, Tldraw, useEditor, useValue,
    DefaultColorStyle, DefaultSizeStyle, DefaultColorThemePalette,
} from '@tldraw/tldraw';

// tldraw 2.4's updateViewportScreenBounds takes a Box and calls .equals() on
// it. Passed the container element, as this file used to, it threw on every
// resize and scroll, so the viewport's bounds were never updated.
const screenBoundsOf = (el) => {
    const r = el.getBoundingClientRect();
    return new TlBox(r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
};
import '@tldraw/tldraw/tldraw.css';
import EditorErrorBoundary from './EditorErrorBoundary';
import GestureOutlinedIcon from '@mui/icons-material/GestureOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { surfaces } from '../../theme/tokens';

const SAVE_DEBOUNCE_MS = 400;

// <Tldraw>'s props must keep their identity across renders. tldraw rebuilds
// its editor when `options` or `components` change, so objects built inline
// made every re-render (each autosave marks the page dirty) re-create the
// canvas and run onMount again. That stacked another store listener each time
// and left the strokes the writer was drawing with no listener that saved them.
const TLDRAW_OPTIONS = {
    // Improve touch responsiveness
    maxPointsPerDrawShape: 200,
};
// Components to hide on mobile for a cleaner UI
const MOBILE_HIDDEN_COMPONENTS = {
    Toolbar: null,           // Hide default toolbar (we have custom)
    StylePanel: null,        // Hide style panel
    NavigationPanel: null,   // Hide navigation/zoom
    PageMenu: null,          // Hide page menu
    ActionsMenu: null,       // Hide actions menu
    HelpMenu: null,          // Hide help menu
    DebugMenu: null,         // Hide debug menu
    SharePanel: null,        // Hide share panel
};
const NO_HIDDEN_COMPONENTS = {};

// Pen styles for the phone toolbar. tldraw's own style panel is hidden on
// phones (it covers the canvas), so the pen's colour and size were unreachable
// there (Chef, 2026-09-27). White is left out: it's invisible on the page.
const PEN_COLORS = ['black', 'grey', 'blue', 'light-blue', 'violet', 'light-violet', 'green', 'light-green', 'yellow', 'orange', 'red', 'light-red'];
const PEN_SIZES = [
    { value: 's', label: 'Small', dot: 5 },
    { value: 'm', label: 'Medium', dot: 8 },
    { value: 'l', label: 'Large', dot: 11 },
    { value: 'xl', label: 'Extra large', dot: 15 },
];
const colorName = (c) => c.replace('-', ' ');

function PenStylePicker({ editor }) {
    const theme = useTheme();
    const palette = DefaultColorThemePalette[theme.palette.mode === 'dark' ? 'darkMode' : 'lightMode'];
    const color = useValue('pen color', () => editor.getStyleForNextShape(DefaultColorStyle), [editor]);
    const size = useValue('pen size', () => editor.getStyleForNextShape(DefaultSizeStyle), [editor]);
    const [anchor, setAnchor] = useState(null);
    const dot = (PEN_SIZES.find((s) => s.value === size) || PEN_SIZES[0]).dot;

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
                            aria-pressed={size === s.value ? 'true' : 'false'}
                            onClick={() => choose(DefaultSizeStyle, s.value)}
                            sx={{ ...swatch, borderColor: size === s.value ? 'primary.main' : 'divider' }}
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

// Minimal mobile toolbar - Move, Write, Pen style, Undo, Fullscreen
function MobileDrawingToolbar({ containerRef, onFullscreenChange }) {
    const editor = useEditor();
    const currentTool = useValue('current tool', () => editor.getCurrentToolId(), [editor]);
    const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor]);
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

    return (
        <Box
            sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
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
            {/* Move */}
            <Tooltip title="Move" placement="top">
                <IconButton
                    aria-label="Move"
                    size="small"
                    onClick={() => editor.setCurrentTool('hand')}
                    sx={{
                        bgcolor: currentTool === 'hand' ? 'primary.main' : 'transparent',
                        color: currentTool === 'hand' ? 'primary.contrastText' : 'text.secondary',
                        '&:hover': {
                            bgcolor: currentTool === 'hand' ? 'primary.dark' : 'action.hover',
                        },
                    }}
                >
                    <PanToolOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Write */}
            <Tooltip title="Write" placement="top">
                <IconButton
                    aria-label="Write"
                    size="small"
                    onClick={() => editor.setCurrentTool('draw')}
                    sx={{
                        bgcolor: currentTool === 'draw' ? 'primary.main' : 'transparent',
                        color: currentTool === 'draw' ? 'primary.contrastText' : 'text.secondary',
                        '&:hover': {
                            bgcolor: currentTool === 'draw' ? 'primary.dark' : 'action.hover',
                        },
                    }}
                >
                    <GestureOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Pen colour and size */}
            <PenStylePicker editor={editor} />

            <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5 }} />

            {/* Undo */}
            <IconButton
                aria-label="Undo"
                size="small"
                onClick={() => editor.undo()}
                disabled={!canUndo}
                sx={{ opacity: canUndo ? 1 : 0.3 }}
            >
                <UndoIcon fontSize="small" />
            </IconButton>

            <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5 }} />

            {/* Fullscreen */}
            <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} placement="top">
                <IconButton
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    size="small"
                    onClick={toggleFullscreen}
                >
                    {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                </IconButton>
            </Tooltip>
        </Box>
    );
}

const HandwrittenEditor = ({ content, setContent, readOnly = false }) => {
    const editorRef = useRef(null);
    const unsubscribeRef = useRef(null);
    const isApplyingSnapshot = useRef(false);
    const lastSavedSnapshot = useRef(content || '');
    const saveTimeoutRef = useRef(null);
    const containerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const loadSnapshot = useCallback((serialized, editor) => {
        if (!serialized) return;
        try {
            const snapshot = JSON.parse(serialized);
            isApplyingSnapshot.current = true;
            editor.store.loadSnapshot(snapshot);
            lastSavedSnapshot.current = serialized;
        } catch (error) {
            console.warn('HandwrittenEditor - Invalid snapshot, ignoring.', error);
        } finally {
            isApplyingSnapshot.current = false;
        }
    }, []);

    const debouncedSave = useCallback((serialized) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            setContent(serialized);
        }, SAVE_DEBOUNCE_MS);
    }, [setContent]);

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        setIsLoading(false);

        // Set initial tool to draw for better mobile experience
        editor.setCurrentTool('draw');
        // Handwriting wants a fine pen: tldraw's default (m) wrote fat lines
        // (Chef, 2026-09-27).
        editor.setStyleForNextShapes(DefaultSizeStyle, 's');

        // Apply dark mode preference based on MUI theme mode
        const isDark = theme.palette.mode === 'dark';
        // tldraw 2.4 renamed isDarkMode to colorScheme, and its validator rejects
        // the old key, so every theme sync used to throw.
        editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });

        if (content) {
            loadSnapshot(content, editor);
        }

        // If onMount runs again, the previous editor's listener must go first,
        // or listeners stack up (one per mount) on stores that are gone.
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }

        if (!readOnly) {
            unsubscribeRef.current = editor.store.listen(() => {
                if (isApplyingSnapshot.current) return;

                const snapshot = editor.store.getSnapshot();
                const serialized = JSON.stringify(snapshot);

                if (serialized !== lastSavedSnapshot.current) {
                    lastSavedSnapshot.current = serialized;
                    debouncedSave(serialized);
                }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content intentionally excluded; initial load only
    }, [loadSnapshot, readOnly, debouncedSave, theme.palette.mode]);

    // Use ResizeObserver for reliable viewport bounds updates
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateBounds = () => {
            if (editorRef.current) {
                // This tells tldraw exactly where its container is on screen
                // Critical for correct touch/mouse coordinate calculation
                editorRef.current.updateViewportScreenBounds(screenBoundsOf(container));
            }
        };

        // ResizeObserver is more reliable than window resize for container changes
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updateBounds);
        });

        resizeObserver.observe(container);

        // Also listen for scroll and orientation changes
        window.addEventListener('scroll', updateBounds, { passive: true });
        window.addEventListener('orientationchange', updateBounds);

        // Initial update after mount
        const initialTimeout = setTimeout(updateBounds, 50);
        // Secondary update to catch late layout shifts
        const secondaryTimeout = setTimeout(updateBounds, 200);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('scroll', updateBounds);
            window.removeEventListener('orientationchange', updateBounds);
            clearTimeout(initialTimeout);
            clearTimeout(secondaryTimeout);
        };
    }, [isLoading]); // Re-run when loading completes


    useEffect(() => {
        if (!editorRef.current) return;
        if (!content || content === lastSavedSnapshot.current) return;
        loadSnapshot(content, editorRef.current);
    }, [content, loadSnapshot]);

    // Sync dark mode preference with Tldraw when theme changes
    useEffect(() => {
        if (editorRef.current) {
            const isDark = theme.palette.mode === 'dark';
            editorRef.current.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });
        }
    }, [theme.palette.mode, isLoading]);

    useEffect(() => {
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    const hiddenMobileComponents = isMobile ? MOBILE_HIDDEN_COMPONENTS : NO_HIDDEN_COMPONENTS;

    return (
        <EditorErrorBoundary title="Drawing canvas failed to load" message="The handwritten editor encountered an error.">
            {/* Container uses absolute positioning within the flex layout */}
            <Box
                ref={containerRef}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    '& .tl-container': {
                        // Ensure tldraw fills container
                        position: 'absolute !important',
                        inset: '0 !important',
                    },
                    // Hide tldraw's action bar on mobile (it overlaps our toolbar)
                    ...(isMobile && {
                        '& .tlui-layout__bottom': {
                            display: 'none',
                        },
                        '& .tlui-layout__top': {
                            display: 'none',
                        },
                    }),
                }}
            >
                {isLoading && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: surfaces(theme).elevated,
                            zIndex: 10,
                        }}
                    >
                        <CircularProgress />
                    </Box>
                )}
                <Tldraw
                    onMount={handleMount}
                    readOnly={readOnly}
                    components={hiddenMobileComponents}
                    options={TLDRAW_OPTIONS}
                >
                {/* Custom mobile toolbar. It must render INSIDE <Tldraw>: it calls
                    useEditor(), which only resolves within tldraw's context. As a
                    sibling it threw on every phone and the error boundary took
                    the whole sketch editor down. */}
                {isMobile && !readOnly && !isLoading && (
                    <MobileDrawingToolbar
                        containerRef={containerRef}
                        onFullscreenChange={() => {
                            // Update tldraw bounds after fullscreen change
                            setTimeout(() => {
                                if (editorRef.current && containerRef.current) {
                                    editorRef.current.updateViewportScreenBounds(screenBoundsOf(containerRef.current));
                                }
                            }, 100);
                        }}
                    />
                )}
                </Tldraw>
            </Box>
        </EditorErrorBoundary>
    );
};

export default HandwrittenEditor;
