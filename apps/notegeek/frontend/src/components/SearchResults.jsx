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
    Divider,
    useTheme,
} from '@mui/material';
import {
    Search as SearchIcon,
    Clear as ClearIcon,
} from '@mui/icons-material';
import useNoteStore from '../store/noteStore';
import { formatRelativeTime } from '../utils/dateUtils';

function getTypeColor(type, palette) {
    return palette.noteTypes?.[type] || palette.noteTypes?.text || palette.primary.main;
}

function getPreview(content) {
    if (!content) return '';
    if (typeof content === 'string' && content.startsWith('data:image/')) return '';
    const plain = String(content).replace(/<[^>]+>/g, '');
    return plain.split(/\r?\n/).filter(Boolean).slice(0, 2).join(' ').slice(0, 180);
}

// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({ note, query }) {
    const theme = useTheme();
    const navigate = useNavigate();
    const type = note.type || 'text';
    const typeColor = getTypeColor(type, theme.palette);
    const isVisual = type === 'handwritten' || type === 'mindmap';
    const preview = isVisual ? '' : getPreview(note.content);

    // Highlight matched terms in primary color
    function highlightQuery(text) {
        if (!query || !text) return text;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
                ? <span key={i} style={{ color: theme.palette.primary.main }}>{part}</span>
                : part
        );
    }

    return (
        <ButtonBase
            onClick={() => navigate(`/notes/${note.id || note._id}`)}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                width: '100%',
                textAlign: 'left',
                py: 1.25,
                px: 0.5,
                borderRadius: 0,
                transition: 'background 120ms ease',
                '&:hover': {
                    bgcolor: theme.palette.glow.soft,
                    '& .type-dot': { transform: 'scale(1.5)' },
                },
            }}
        >
            {/* Type dot */}
            <Box
                className="type-dot"
                sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: typeColor,
                    flexShrink: 0,
                    mt: '7px',
                    transition: 'transform 120ms ease',
                }}
            />

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    variant="body1"
                    sx={{
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.45,
                    }}
                >
                    {highlightQuery(note.title || 'Untitled')}
                </Typography>
                {preview && (
                    <Typography
                        variant="caption"
                        component="div"
                        sx={{
                            color: 'text.secondary',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.5,
                            mt: 0.25,
                        }}
                    >
                        {highlightQuery(preview)}
                    </Typography>
                )}
            </Box>

            {/* Tag pills — hidden on xs */}
            {note.tags && note.tags.length > 0 && (
                <Box
                    sx={{
                        display: { xs: 'none', sm: 'flex' },
                        gap: 0.5,
                        flexShrink: 0,
                        alignSelf: 'center',
                    }}
                >
                    {note.tags.slice(0, 2).map((tag) => (
                        <Typography
                            key={tag}
                            variant="caption"
                            sx={{
                                px: 0.75,
                                py: 0.125,
                                borderRadius: '4px',
                                border: `1px solid ${theme.palette.border}`,
                                bgcolor: theme.palette.glow.soft,
                                color: 'text.secondary',
                                lineHeight: '18px',
                            }}
                        >
                            {tag.split('/').pop()}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* Timestamp */}
            <Typography
                variant="caption"
                sx={{
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                    color: 'text.disabled',
                    alignSelf: 'center',
                }}
            >
                {formatRelativeTime(note.updatedAt || note.createdAt)}
            </Typography>
        </ButtonBase>
    );
}

// ─── SearchResults ────────────────────────────────────────────────────────────

function SearchResults() {
    const theme = useTheme();
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
        <Box sx={{ maxWidth: 720, mx: 'auto', py: { xs: 1.5, sm: 2 } }}>
            {/* Search input — aligned with the Ink Studio aesthetic */}
            <TextField
                inputRef={inputRef}
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                variant="outlined"
                placeholder="Search titles, content, tags…"
                autoFocus
                size="small"
                sx={{ mb: 2.5 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: 'text.disabled', fontSize: 17 }} />
                        </InputAdornment>
                    ),
                    endAdornment: searchTerm ? (
                        <InputAdornment position="end">
                            <IconButton
                                onClick={handleClear}
                                edge="end"
                                size="small"
                                sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                            >
                                <ClearIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                        </InputAdornment>
                    ) : null,
                }}
            />

            {/* Results */}
            {isSearching ? (
                <Box>
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} height={52} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
                    ))}
                </Box>
            ) : searchError ? (
                <Alert severity="error">{searchError}</Alert>
            ) : searchResults.length > 0 ? (
                <Box>
                    <Box sx={{ mb: 1.5, px: 0.5 }}>
                        <Typography variant="h6" sx={{ color: 'text.disabled' }}>
                            {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                        </Typography>
                    </Box>
                    <Box>
                        {searchResults.map((note, idx) => (
                            <React.Fragment key={note.id || note._id}>
                                {idx > 0 && (
                                    <Divider sx={{ borderColor: theme.palette.divider }} />
                                )}
                                <ResultRow note={note} query={query} />
                            </React.Fragment>
                        ))}
                    </Box>
                </Box>
            ) : query ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.5 }}>
                        No matches for &ldquo;{query}&rdquo;
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Try different keywords or check spelling
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ color: 'text.disabled' }}>
                        Search by title, content, or tags
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default SearchResults;
