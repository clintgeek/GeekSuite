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

// Type configuration with colors matching NoteList
const TYPE_CONFIG = {
    [NOTE_TYPES.TEXT]: { icon: TextIcon, label: 'Text', color: '#5B50A8' },
    [NOTE_TYPES.MARKDOWN]: { icon: MarkdownIcon, label: 'Markdown', color: '#7B5DAE' },
    [NOTE_TYPES.CODE]: { icon: CodeIcon, label: 'Code', color: '#4A8C6F' },
    [NOTE_TYPES.MINDMAP]: { icon: MindMapIcon, label: 'Mind Map', color: '#3D8493' },
    [NOTE_TYPES.HANDWRITTEN]: { icon: HandwrittenIcon, label: 'Handwritten', color: '#A85C73' },
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
            {Object.entries(TYPE_CONFIG).map(([type, config]) => {
                const Icon = config.icon;
                const isActive = value === type;

                return (
                    <Tooltip key={type} title={config.label} arrow>
                        <Box
                            component="button"
                            onClick={() => onChange(type)}
                            aria-label={config.label}
                            aria-pressed={isActive}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 36,
                                height: 32,
                                border: 'none',
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                bgcolor: isActive ? config.color : 'transparent',
                                color: isActive ? '#fff' : 'text.secondary',
                                '&:hover': {
                                    bgcolor: isActive
                                        ? config.color
                                        : alpha(config.color, 0.15),
                                    color: isActive ? '#fff' : config.color,
                                },
                                '&:focus-visible': {
                                    outline: `2px solid ${config.color}`,
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