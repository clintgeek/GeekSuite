import React from 'react';
import { Box, Tooltip, alpha, useTheme } from '@mui/material';
import {
    Description as MarkdownIcon,
    TextFields as TextIcon,
    Code as CodeIcon,
    AccountTree as MindMapIcon,
    Draw as HandwrittenIcon,
} from '@mui/icons-material';
import { NOTE_TYPES } from './notes/NoteTypeRouter';

// Icon + label per type. Colors come from theme.palette.noteTypes so the
// type swatch matches NoteRow / NoteMetaBar / NoteViewer in both modes.
const TYPE_META = {
    [NOTE_TYPES.TEXT]:        { icon: TextIcon,        label: 'Text',        themeKey: 'text' },
    [NOTE_TYPES.MARKDOWN]:    { icon: MarkdownIcon,    label: 'Markdown',    themeKey: 'markdown' },
    [NOTE_TYPES.CODE]:        { icon: CodeIcon,        label: 'Code',        themeKey: 'code' },
    [NOTE_TYPES.MINDMAP]:     { icon: MindMapIcon,     label: 'Mind Map',    themeKey: 'mindmap' },
    [NOTE_TYPES.HANDWRITTEN]: { icon: HandwrittenIcon, label: 'Handwritten', themeKey: 'handwritten' },
};

function NoteTypeSelector({ value, onChange }) {
    const theme = useTheme();

    return (
        <Box
            sx={{
                display: 'flex',
                gap: 0.5,
                p: 0.5,
                bgcolor: alpha(theme.palette.divider, 0.5),
                borderRadius: 2,
            }}
        >
            {Object.entries(TYPE_META).map(([type, meta]) => {
                const Icon = meta.icon;
                const isActive = value === type;
                const typeColor = theme.palette.noteTypes?.[meta.themeKey] || theme.palette.text.primary;

                return (
                    <Tooltip key={type} title={meta.label} arrow>
                        <Box
                            component="button"
                            onClick={() => onChange(type)}
                            aria-label={meta.label}
                            aria-pressed={isActive}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 36,
                                height: 32,
                                border: 'none',
                                borderRadius: 1,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                bgcolor: isActive ? typeColor : 'transparent',
                                color: isActive ? theme.palette.background.paper : 'text.secondary',
                                '&:hover': {
                                    bgcolor: isActive ? typeColor : alpha(typeColor, 0.12),
                                    color: isActive ? theme.palette.background.paper : typeColor,
                                },
                                '&:focus-visible': {
                                    outline: `2px solid ${typeColor}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            <Icon sx={{ fontSize: 18 }} />
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}

export default NoteTypeSelector;