import React, { useState } from 'react';
import {
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Button,
    TextField,
} from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { GeekDialog } from '@geeksuite/ui';
import useTagStore from '../store/tagStore';

function TagContextMenu({ anchorEl, open, onClose, tag }) {
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [newTagName, setNewTagName] = useState(tag);
    const { renameTag, deleteTag } = useTagStore();

    const handleRename = async () => {
        if (newTagName && newTagName !== tag) {
            await renameTag(tag, newTagName);
        }
        setRenameDialogOpen(false);
        onClose();
    };

    const handleDelete = async () => {
        if (window.confirm(`Are you sure you want to delete the tag "${tag}"? This cannot be undone.`)) {
            await deleteTag(tag);
            onClose();
        }
    };

    const handleRenameClick = () => {
        setNewTagName(tag);
        setRenameDialogOpen(true);
    };

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
                <MenuItem onClick={handleRenameClick}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename Tag</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText sx={{ color: 'error.main' }}>Delete Tag</ListItemText>
                </MenuItem>
            </Menu>

            {/* A form dialog — default `GeekDialog` mode (full-screen below
                `sm`). The primitive's own ✕ is the mobile cancel. */}
            <GeekDialog
                open={renameDialogOpen}
                onClose={() => setRenameDialogOpen(false)}
                title="Rename Tag"
                primaryAction={
                    <Button onClick={handleRename} variant="contained" color="primary">
                        Rename
                    </Button>
                }
                secondaryAction={
                    <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                }
            >
                <TextField
                    autoFocus
                    margin="dense"
                    label="New Tag Name"
                    type="text"
                    fullWidth
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    variant="outlined"
                />
            </GeekDialog>
        </>
    );
}

export default TagContextMenu;