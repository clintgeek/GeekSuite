import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircularProgress, Box, useTheme, useMediaQuery, IconButton, Tooltip } from '@mui/material';
import { Tldraw, useEditor, useValue } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import EditorErrorBoundary from './EditorErrorBoundary';
import GestureOutlinedIcon from '@mui/icons-material/GestureOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';

const SAVE_DEBOUNCE_MS = 400;

// Minimal mobile toolbar - Move, Write, Undo, Fullscreen
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

            <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5 }} />

            {/* Undo */}
            <IconButton
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

        if (content) {
            loadSnapshot(content, editor);
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
    }, [loadSnapshot, readOnly, debouncedSave]);

    // Use ResizeObserver for reliable viewport bounds updates
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateBounds = () => {
            if (editorRef.current) {
                // This tells tldraw exactly where its container is on screen
                // Critical for correct touch/mouse coordinate calculation
                editorRef.current.updateViewportScreenBounds(container);
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

    // Components to hide on mobile for a cleaner UI
    const hiddenMobileComponents = isMobile ? {
        Toolbar: null,           // Hide default toolbar (we have custom)
        StylePanel: null,        // Hide style panel
        NavigationPanel: null,   // Hide navigation/zoom
        PageMenu: null,          // Hide page menu
        ActionsMenu: null,       // Hide actions menu
        HelpMenu: null,          // Hide help menu
        DebugMenu: null,         // Hide debug menu
        SharePanel: null,        // Hide share panel
    } : {};

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
                            bgcolor: 'background.paper',
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
                    options={{
                        // Improve touch responsiveness
                        maxPointsPerDrawShape: 200,
                    }}
                />
                {/* Custom mobile toolbar */}
                {isMobile && !readOnly && !isLoading && (
                    <MobileDrawingToolbar
                        containerRef={containerRef}
                        onFullscreenChange={() => {
                            // Update tldraw bounds after fullscreen change
                            setTimeout(() => {
                                if (editorRef.current && containerRef.current) {
                                    editorRef.current.updateViewportScreenBounds(containerRef.current);
                                }
                            }, 100);
                        }}
                    />
                )}
            </Box>
        </EditorErrorBoundary>
    );
};

export default HandwrittenEditor;