import React, { useState } from 'react';
import {
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Button,
    TextField,
    DialogContentText,
} from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useLazyQuery } from '@apollo/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekDialog } from '@geeksuite/ui';
import useTagStore from '../store/tagStore';
import { NOTE_TAG_USAGE } from '../graphql/queries';
import {
    normalizeTag,
    isInSubtree,
    swapPrefix,
    tagHref,
    parentTag,
    renameProblem,
    deleteSummary,
    renameSummary,
} from '../utils/tagPath';

/**
 * The tag row's menu: rename-or-move, and delete. Both act on the tag AND
 * everything beneath it — the gateway rewrites the subtree.
 *
 * The dialogs keep their own copy of the tag: the menu's `tag` prop is
 * cleared the moment the menu closes, and a dialog must not lose what it is
 * about halfway through.
 */
function TagContextMenu({ anchorEl, open, onClose, tag }) {
    const [renameFor, setRenameFor] = useState(null);
    const [deleteFor, setDeleteFor] = useState(null);
    const [newTagName, setNewTagName] = useState('');
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);
    const { renameTag, deleteTag } = useTagStore();
    const location = useLocation();
    const navigate = useNavigate();
    const [loadUsage, { data: usageData, loading: usageLoading }] = useLazyQuery(NOTE_TAG_USAGE, {
        fetchPolicy: 'network-only',
    });

    // The tag view on screen, if any, so a rename/delete of it (or of an
    // ancestor) doesn't leave the user on a page for a tag that's gone.
    const viewing = location.pathname.startsWith('/tags/')
        ? decodeURIComponent(location.pathname.slice('/tags/'.length))
        : null;

    const openRename = () => {
        setRenameFor(tag);
        setNewTagName(tag || '');
        setActionError(null);
        // What the rename will touch, archived notes included (spec A8).
        if (tag) loadUsage({ variables: { tag } });
        onClose();
    };

    const openDelete = () => {
        setDeleteFor(tag);
        setActionError(null);
        if (tag) loadUsage({ variables: { tag } });
        onClose();
    };

    const closeDialogs = () => {
        if (busy) return;
        setRenameFor(null);
        setDeleteFor(null);
        setActionError(null);
    };

    const problem = renameFor ? renameProblem(renameFor, newTagName) : null;
    const target = normalizeTag(newTagName);

    const handleRename = async () => {
        if (!renameFor || problem) return;
        // The gateway normalizes and treats an equal rename as a no-op;
        // compare the normalized name here too so the local store never
        // applies a rename the server did not perform.
        if (target === renameFor) {
            setRenameFor(null);
            return;
        }
        setBusy(true);
        try {
            await renameTag(renameFor, target);
            if (viewing && isInSubtree(viewing, renameFor)) {
                navigate(tagHref(swapPrefix(viewing, renameFor, target)), { replace: true });
            }
            setRenameFor(null);
        } catch (err) {
            setActionError(err?.message || 'Could not rename the tag.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteFor) return;
        setBusy(true);
        try {
            await deleteTag(deleteFor);
            if (viewing && isInSubtree(viewing, deleteFor)) navigate('/notes', { replace: true });
            setDeleteFor(null);
        } catch (err) {
            setActionError(err?.message || 'Could not delete the tag.');
        } finally {
            setBusy(false);
        }
    };

    const usage = usageData?.noteTagUsage || null;

    return (
        <>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={onClose}
                anchorOrigin={{
                    vertical: 'center',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'center',
                    horizontal: 'left',
                }}
            >
                <MenuItem onClick={openRename} sx={{ minHeight: 44 }}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename or move</ListItemText>
                </MenuItem>
                <MenuItem onClick={openDelete} sx={{ minHeight: 44 }}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText sx={{ color: 'error.main' }}>Delete tag</ListItemText>
                </MenuItem>
            </Menu>

            {/* A form dialog — default `GeekDialog` mode (full-screen below
                `sm`). The primitive's own ✕ is the mobile cancel. */}
            <GeekDialog
                open={Boolean(renameFor)}
                onClose={closeDialogs}
                title={renameFor ? `Rename or move #${renameFor}` : 'Rename or move'}
                primaryAction={
                    <Button
                        onClick={handleRename}
                        variant="contained"
                        color="primary"
                        disabled={Boolean(problem) || busy}
                    >
                        {renameFor && target && parentTag(target) !== parentTag(renameFor) ? 'Move' : 'Rename'}
                    </Button>
                }
                secondaryAction={
                    <Button onClick={closeDialogs} disabled={busy}>Cancel</Button>
                }
            >
                {!usageLoading && renameSummary(renameFor || '', usage) ? (
                    <DialogContentText data-testid="rename-tag-summary" sx={{ mb: 1 }}>
                        {renameSummary(renameFor || '', usage)}
                    </DialogContentText>
                ) : null}
                <TextField
                    autoFocus
                    margin="dense"
                    label="Tag path"
                    type="text"
                    fullWidth
                    value={newTagName}
                    onChange={(e) => { setNewTagName(e.target.value); setActionError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRename(); } }}
                    variant="outlined"
                    error={Boolean(problem || actionError)}
                    helperText={
                        problem || actionError
                        || 'Sub-tags and their notes come along. Use / to move it — e.g. house/garage puts it under house.'
                    }
                    inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                />
            </GeekDialog>

            {/* A two-line confirm: the centered card at every width, like
                DeleteNoteDialog — the full-screen rule is for forms. */}
            <GeekDialog
                open={Boolean(deleteFor)}
                onClose={closeDialogs}
                mode="window"
                title={deleteFor ? `Delete #${deleteFor}?` : 'Delete tag?'}
                primaryAction={
                    <Button
                        onClick={handleDelete}
                        variant="contained"
                        color="error"
                        disabled={busy || usageLoading}
                    >
                        Delete tag
                    </Button>
                }
                secondaryAction={
                    <Button onClick={closeDialogs} variant="text" color="inherit" disabled={busy}>
                        Cancel
                    </Button>
                }
            >
                <DialogContentText data-testid="delete-tag-summary">
                    {usageLoading ? 'Counting notes…' : deleteSummary(deleteFor || '', usage)}
                </DialogContentText>
                {actionError && (
                    <DialogContentText sx={{ color: 'error.main', mt: 1 }} role="alert">
                        {actionError}
                    </DialogContentText>
                )}
            </GeekDialog>
        </>
    );
}

export default TagContextMenu;
