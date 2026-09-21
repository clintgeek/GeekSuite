import React, { useState } from 'react';
import { useQuery, useLazyQuery, useMutation } from '@apollo/client';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    List,
    ListItemButton,
    ListItemText,
    Stack,
    Typography,
} from '@mui/material';
import { GET_NOTE_VERSIONS, GET_NOTE_VERSION } from '../../graphql/queries';
import { RESTORE_NOTE_VERSION } from '../../graphql/mutations';

/**
 * NoteHistoryDialog — see and restore an earlier version of a note.
 *
 * The point of the history is being able to get work back, so this is the
 * half that makes the storage worth anything. It lists versions newest first,
 * fetches one body at a time (the list query deliberately omits content), and
 * restores through a mutation that snapshots the CURRENT state first — so a
 * restore to the wrong version is itself undoable.
 *
 * The `reason` chip matters more than it looks: it is how you tell "I typed
 * over this" from "Tidy replaced this" from "Compose replaced this", which is
 * usually the thing you are actually looking for.
 */

const REASON_LABEL = {
    edit: 'Edit',
    tidy: 'Tidy',
    compose: 'Compose',
    restore: 'Restore',
};

const when = (iso) => {
    if (!iso) return '';
    const d = new Date(Number.isNaN(Number(iso)) ? iso : Number(iso));
    if (Number.isNaN(d.getTime())) return '';
    // Local time: this is a timestamp a person reads, not a stored instant.
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
};

export default function NoteHistoryDialog({ open, noteId, onClose, onRestored }) {
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState(null);

    const { data, loading } = useQuery(GET_NOTE_VERSIONS, {
        variables: { noteId },
        skip: !open || !noteId,
        fetchPolicy: 'network-only',
    });

    const [fetchVersion, { data: versionData, loading: loadingVersion }] =
        useLazyQuery(GET_NOTE_VERSION, { fetchPolicy: 'network-only' });

    const [restoreVersion, { loading: restoring }] = useMutation(RESTORE_NOTE_VERSION);

    const versions = data?.noteVersions || [];
    const body = versionData?.noteVersion;

    const pick = (version) => {
        setSelected(version.id);
        setError(null);
        fetchVersion({ variables: { id: version.id } });
    };

    const handleRestore = async () => {
        if (!selected) return;
        setError(null);
        try {
            const { data: restored } = await restoreVersion({ variables: { versionId: selected } });
            onRestored?.(restored?.restoreNoteVersion);
            onClose?.();
        } catch (err) {
            setError(err?.message || 'Could not restore that version.');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>History</DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={20} />
                    </Box>
                ) : null}

                {!loading && versions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
                        No earlier versions yet. One is kept each time the note's text changes.
                    </Typography>
                ) : null}

                {!loading && versions.length > 0 ? (
                    <Box sx={{ display: 'flex', minHeight: 320 }}>
                        <List dense sx={{ width: 260, borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>
                            {versions.map((v) => (
                                <ListItemButton
                                    key={v.id}
                                    selected={selected === v.id}
                                    onClick={() => pick(v)}
                                >
                                    <ListItemText
                                        primary={when(v.createdAt)}
                                        secondary={v.title || 'Untitled'}
                                        primaryTypographyProps={{ fontSize: '0.8125rem' }}
                                        secondaryTypographyProps={{ noWrap: true, fontSize: '0.75rem' }}
                                    />
                                    <Chip
                                        size="small"
                                        label={REASON_LABEL[v.reason] || v.reason || 'Edit'}
                                        sx={{ ml: 1, height: 20, fontSize: '0.6875rem' }}
                                    />
                                </ListItemButton>
                            ))}
                        </List>

                        <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
                            {!selected ? (
                                <Typography variant="body2" color="text.secondary">
                                    Pick a version to see it.
                                </Typography>
                            ) : null}
                            {loadingVersion ? <CircularProgress size={18} /> : null}
                            {!loadingVersion && body ? (
                                <Box
                                    component="pre"
                                    sx={{
                                        m: 0,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontFamily: '"Roboto Mono", monospace',
                                        fontSize: '0.8125rem',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {body.content}
                                </Box>
                            ) : null}
                        </Box>
                    </Box>
                ) : null}

                {error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ flex: 1 }} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                        Restoring keeps the current version too, so this is undoable.
                    </Typography>
                </Stack>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>Close</Button>
                <Button
                    variant="contained"
                    onClick={handleRestore}
                    disabled={!selected || restoring || loadingVersion}
                    sx={{ textTransform: 'none' }}
                >
                    {restoring ? 'Restoring…' : 'Restore this version'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
