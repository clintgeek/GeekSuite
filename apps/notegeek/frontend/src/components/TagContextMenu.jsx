import React, { useState } from 'react';
import {
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
} from '@mui/material';
import {
    Edit as EditIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';
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

            <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
                <DialogTitle>Rename Tag</DialogTitle>
                <DialogContent>
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
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRename} variant="contained" color="primary">
                        Rename
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default TagContextMenu;