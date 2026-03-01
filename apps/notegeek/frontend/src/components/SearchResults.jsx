import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    TextField,
    Typography,
    ButtonBase,
    Alert,
    InputAdornment,
    IconButton,
    Skeleton,
    useTheme,
    alpha,
} from '@mui/material';
import {
    Search as SearchIcon,
    Clear as ClearIcon,
} from '@mui/icons-material';
import useNoteStore from '../store/noteStore';
import { formatRelativeTime } from '../utils/dateUtils';

const TYPE_COLORS = {
    text: { light: '#5B50A8', dark: '#A99DF0' },
    markdown: { light: '#7B5DAE', dark: '#B89BD8' },
    code: { light: '#4A8C6F', dark: '#7DB99A' },
    mindmap: { light: '#3D8493', dark: '#6DB5C0' },
    handwritten: { light: '#A85C73', dark: '#D49AAE' },
};

function getPreview(content) {
    if (!content) return '';
    if (typeof content === 'string' && content.startsWith('data:image/')) return '';
    const plain = String(content).replace(/<[^>]+>/g, '');
    return plain.split(/\r?\n/).filter(Boolean).slice(0, 1).join(' ').slice(0, 120);
}

function ResultRow({ note }) {
    const theme = useTheme();
    const navigate = useNavigate();
    const isDark = theme.palette.mode === 'dark';
    const type = note.type || 'text';
    const tc = TYPE_COLORS[type] || TYPE_COLORS.text;
    const typeColor = isDark ? tc.dark : tc.light;
    const preview = (type === 'handwritten' || type === 'mindmap') ? '' : getPreview(note.content);

    return (
        <ButtonBase
            onClick={() => navigate(`/notes/${note._id}`)}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                width: '100%',
                textAlign: 'left',
                py: 0.875,
                px: 1.5,
                borderRadius: 1.5,
                transition: 'background 80ms ease',
                '&:hover': {
                    bgcolor: alpha(theme.palette.text.primary, 0.03),
                },
            }}
        >
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: typeColor, flexShrink: 0, mt: 0.25 }} />

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: '0.8125rem',
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.4,
                    }}
                >
                    {note.title || 'Untitled'}
                </Typography>
                {preview && (
                    <Typography
                        sx={{
                            fontSize: '0.6875rem',
                            color: 'text.disabled',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.4,
                        }}
                    >
                        {preview}
                    </Typography>
                )}
            </Box>

            {note.tags && note.tags.length > 0 && (
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, flexShrink: 0 }}>
                    {note.tags.slice(0, 2).map((tag) => (
                        <Typography
                            key={tag}
                            sx={{
                                fontSize: '0.625rem',
                                color: 'text.disabled',
                                bgcolor: alpha(theme.palette.text.primary, 0.04),
                                px: 0.625,
                                py: 0.125,
                                borderRadius: 0.75,
                            }}
                        >
                            {tag.split('/').pop()}
                        </Typography>
                    ))}
                </Box>
            )}

            <Typography
                sx={{
                    fontSize: '0.625rem',
                    color: 'text.disabled',
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                }}
            >
                {formatRelativeTime(note.updatedAt || note.createdAt)}
            </Typography>
        </ButtonBase>
    );
}

function SearchResults() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(query);
    const { searchNotes, searchResults, isSearching, searchError } = useNoteStore();
    const inputRef = useRef(null);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm) {
                setSearchParams({ q: searchTerm });
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, setSearchParams]);

    useEffect(() => {
        if (query) {
            searchNotes(query);
        }
    }, [query, searchNotes]);

    const handleClear = () => {
        setSearchTerm('');
        setSearchParams({ q: '' });
        inputRef.current?.focus();
    };

    return (
        <Box sx={{ maxWidth: 680, mx: 'auto', py: { xs: 1.5, sm: 2 } }}>
            {/* Search input */}
            <TextField
                inputRef={inputRef}
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                variant="outlined"
                placeholder="Search titles, content, tags..."
                autoFocus
                size="small"
                sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                        fontSize: '0.8125rem',
                    },
                }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
                        </InputAdornment>
                    ),
                    endAdornment: searchTerm ? (
                        <InputAdornment position="end">
                            <IconButton onClick={handleClear} edge="end" size="small"
                                sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                            >
                                <ClearIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </InputAdornment>
                    ) : null,
                }}
            />

            {/* Results */}
            {isSearching ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} height={36} sx={{ borderRadius: 1.5 }} />
                    ))}
                </Box>
            ) : searchError ? (
                <Alert severity="error">{searchError}</Alert>
            ) : searchResults.length > 0 ? (
                <Box>
                    <Typography
                        variant="overline"
                        sx={{ display: 'block', color: 'text.disabled', mb: 0.5, px: 0.5 }}
                    >
                        {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        {searchResults.map((note) => (
                            <ResultRow key={note._id} note={note} />
                        ))}
                    </Box>
                </Box>
            ) : query ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', mb: 0.5 }}>
                        No matches for &ldquo;{query}&rdquo;
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
                        Try different keywords or check spelling
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled' }}>
                        Search by title, content, or tags
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default SearchResults;