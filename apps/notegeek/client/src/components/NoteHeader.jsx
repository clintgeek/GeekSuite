import React from 'react';
import {
    Box,
    TextField,
    Autocomplete,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    Save as SaveIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';

function NoteHeader({
    title,
    setTitle,
    selectedTags,
    setSelectedTags,
    tags,
    isLoading,
    onDelete,
    isEditing
}) {
    const formatTag = (tag) => {
        return tag
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_\-/]/g, '');
    };

    const handleTagsChange = (event, newValue) => {
        const cleanedTags = [...new Set(
            newValue
                .map(tag => formatTag(tag))
                .filter(tag => tag)
        )];
        setSelectedTags(cleanedTags);
    };

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 2,
            px: { xs: 0, sm: 0 }
        }}>
            <TextField
                placeholder="Title (optional)"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                fullWidth
                variant="standard"
                disabled={isLoading}
                sx={{
                    '& .MuiInputBase-input': {
                        fontSize: '1.25rem',
                        '&::placeholder': {
                            color: 'text.secondary',
                            opacity: 0.7,
                        },
                    },
                }}
            />
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <Tooltip title="Save">
                    <IconButton
                        type="submit"
                        size="small"
                        disabled={isLoading}
                        sx={{
                            color: 'primary.main',
                            '&:hover': {
                                bgcolor: 'rgba(96, 152, 204, 0.04)'
                            }
                        }}
                    >
                        <SaveIcon />
                    </IconButton>
                </Tooltip>
                {isEditing && (
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            onClick={onDelete}
                            sx={{
                                color: '#d32f2f',
                                '&:hover': {
                                    bgcolor: 'rgba(211, 47, 47, 0.04)'
                                }
                            }}
                        >
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Box sx={{ width: 200 }}>
                <Autocomplete
                    multiple
                    freeSolo
                    options={tags}
                    value={selectedTags}
                    onChange={handleTagsChange}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            variant="standard"
                            placeholder="Add tags..."
                            disabled={isLoading}
                        />
                    )}
                    disabled={isLoading}
                />
            </Box>
        </Box>
    );
}

export default NoteHeader;