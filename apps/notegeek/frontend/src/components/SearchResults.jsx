import React, { useState, useEffect, useRef, useId } from 'react';
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
import { GeekEmptyState, GeekErrorState, GeekSlashHint, slashFocusProps } from '@geeksuite/ui';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import NoteRow from './notes/NoteRow';
import useNoteStore from '../store/noteStore';
import { layout, graphiteTokens } from '../theme/tokens';


// ─── pieces ───────────────────────────────────────────────────────────────────

/** Rows divided by hairlines — the list as it has always looked. */
function ResultList({ notes, query }) {
    const theme = useTheme();
    return (
        <Box>
            {notes.map((note, idx) => (
                <React.Fragment key={note.id || note._id}>
                    {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider }} />}
                    <NoteRow note={note} query={query} maxPreview={180} />
                </React.Fragment>
            ))}
        </Box>
    );
}

/**
 * The one clear answer, when the gateway names one (`bestMatch`). A little
 * louder than a row, never shouty (Graphite): the label sits on a pass of
 * highlighter — the accent as a fill, dark ink on it, as everywhere else —
 * and the row is on the writing sheet with a highlighter rule down its left
 * edge, showing the passage that matched at up to four lines.
 */
function BestMatch({ note, query }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const headingId = useId();
    return (
        <Box component="section" aria-labelledby={headingId} data-search-best="">
            <Box sx={{ px: '8px', mb: '8px' }}>
                <Typography
                    id={headingId}
                    component="h2"
                    sx={{
                        display: 'inline-block',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        lineHeight: 1.4,
                        color: g.onHl,
                        bgcolor: g.hl,
                        borderRadius: '2px',
                        px: '6px',
                    }}
                >
                    Best match
                </Typography>
            </Box>
            <Box
                sx={{
                    bgcolor: g.sheet,
                    border: `1px solid ${g.rule}`,
                    borderLeft: `4px solid ${g.hl}`,
                    borderRadius: '4px',
                }}
            >
                <NoteRow note={note} query={query} maxPreview={360} prominent />
            </Box>
        </Box>
    );
}

// ─── SearchResults ────────────────────────────────────────────────────────────

function SearchResults() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(query);
    const { searchNotes, searchResults, isSearching, searchError, clearSearchResults } = useNoteStore();
    const inputRef = useRef(null);
    const meaningCount = searchResults.filter((r) => r.matchedBy === 'meaning').length;
    // Hybrid search may name one clear answer (DOCS/CONTEXT.md §11). It gets
    // its own block; the rest follow under a quieter heading. No best match:
    // the plain list, exactly as before.
    const best = searchResults.find((r) => r.bestMatch) || null;
    const rest = best ? searchResults.filter((r) => r !== best) : searchResults;
    const alsoId = useId();

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
        <Box sx={{ maxWidth: layout.contentWidth, mx: 'auto', py: { xs: 1.5, sm: 2 }, px: { xs: '12px', sm: '16px' } }}>
            {/* Search input — aligned with the Ink Studio aesthetic */}
            <TextField
                inputRef={inputRef}
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                variant="outlined"
                placeholder="Search titles, content, tags…"
                autoFocus
                // The page's own search outranks the header's on this route.
                {...slashFocusProps(20)}
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
                                aria-label="Clear search"
                                edge="end"
                                size="small"
                                sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                            >
                                <ClearIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                        </InputAdornment>
                    ) : (
                        <InputAdornment position="end" aria-hidden="true">
                            <GeekSlashHint />
                        </InputAdornment>
                    ),
                }}
            />

            {/* Results. While a newer search is in flight the previous results
                stay on screen (with a quiet "Searching…"): results update as
                you type, and a hybrid search can take a second while the
                query is embedded — blanking the list to skeletons on every
                pause made the page flicker under your thumb. */}
            {isSearching && searchResults.length === 0 ? (
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
                <Box aria-busy={isSearching || undefined}>
                    <Box sx={{ mb: 1.5, px: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ color: 'text.muted' }}>
                            {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                            {meaningCount > 0 ? ` · ${meaningCount} similar` : ''}
                        </Typography>
                        {isSearching && (
                            <CircularProgress size={12} thickness={4} aria-label="Searching" sx={{ color: 'text.disabled' }} />
                        )}
                    </Box>
                    {best ? (
                        <>
                            <BestMatch note={best} query={query} />
                            {rest.length > 0 && (
                                <Box component="section" aria-labelledby={alsoId} data-search-also="">
                                    <Typography
                                        id={alsoId}
                                        component="h2"
                                        sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.4, px: '8px', mt: '20px', mb: '4px' }}
                                    >
                                        Also related
                                    </Typography>
                                    <ResultList notes={rest} query={query} />
                                </Box>
                            )}
                        </>
                    ) : (
                        <ResultList notes={searchResults} query={query} />
                    )}
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
