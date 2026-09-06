import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    TextField,
    Typography,
    InputAdornment,
    IconButton,
    Skeleton,
    CircularProgress,
    Divider,
    useTheme,
} from '@mui/material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import NoteRow from './notes/NoteRow';
import useNoteStore from '../store/noteStore';
import { layout } from '../theme/tokens';


// ─── SearchResults ────────────────────────────────────────────────────────────

function SearchResults() {
    const theme = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(query);
    const { searchNotes, searchResults, isSearching, searchError, clearSearchResults } = useNoteStore();
    const inputRef = useRef(null);

    // Debounce the box into the URL. The `if (searchTerm)` guard that used to
    // wrap this meant an EMPTIED box never wrote `q=''`: `query` kept its old
    // value, the search effect below never re-ran, and the page went on showing
    // results for a term the user had just backspaced away.
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setSearchParams(searchTerm ? { q: searchTerm } : {}, { replace: true });
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, setSearchParams]);

    useEffect(() => {
        if (query) {
            searchNotes(query);
        } else {
            clearSearchResults();
        }
    }, [query, searchNotes, clearSearchResults]);

    const handleClear = () => {
        setSearchTerm('');
        setSearchParams({}, { replace: true });
        clearSearchResults();
        inputRef.current?.focus();
    };

    return (
        <Box sx={{ maxWidth: layout.contentWidth, mx: 'auto', py: { xs: 1.5, sm: 2 } }}>
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
                        <Typography variant="caption" sx={{ color: 'text.muted' }}>
                            Searching…
                        </Typography>
                    </Box>
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} height={52} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
                    ))}
                </Box>
            ) : searchError ? (
                <GeekErrorState
                    compact
                    error={searchError}
                    // Guarded: the resolver throws on an empty `q`, and this
                    // button was reachable with `query === ''` right after a
                    // clear — retrying straight into another error.
                    onRetry={query ? () => searchNotes(query) : undefined}
                />
            ) : searchResults.length > 0 ? (
                <Box>
                    <Box sx={{ mb: 1.5, px: 0.5 }}>
                        <Typography variant="h6" sx={{ color: 'text.muted' }}>
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
                <GeekEmptyState
                    title={`No matches for “${query}”`}
                    titleSx={{ color: 'text.secondary' }}
                    description="Try a tag path (e.g. work/ideas) or a partial word"
                />
            ) : (
                <GeekEmptyState
                    title="Search by title, content, or tags"
                    description="Press / from anywhere to focus search"
                />
            )}
        </Box>
    );
}

export default SearchResults;
