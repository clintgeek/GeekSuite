import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    TextField,
    Typography,
    Alert,
    InputAdornment,
    IconButton,
    Skeleton,
    CircularProgress,
    Divider,
    useTheme,
} from '@mui/material';
import {
    Search as SearchIcon,
    Clear as ClearIcon,
} from '@mui/icons-material';
import NoteRow from './notes/NoteRow';
import useNoteStore from '../store/noteStore';


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
                    {/* Subtle inline searching indicator */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
                        <CircularProgress size={14} thickness={4} sx={{ color: 'text.disabled' }} />
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            Searching…
                        </Typography>
                    </Box>
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
                                <NoteRow note={note} query={query} maxPreview={180} />
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
                        Try a tag path (e.g. work/ideas) or a partial word
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.5 }}>
                        Search by title, content, or tags
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Press / from anywhere to focus search
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default SearchResults;
