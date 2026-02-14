import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { Paper, Typography, IconButton, Box, Tooltip, TextField } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';

/**
 * MindMapNode - A node in the mind map with inline editing
 * Double-click to edit, Enter to save, Escape to cancel
 */
function MindMapNode({ data, isConnectable, selected }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data.label);
    const inputRef = useRef(null);

    // Determine if this node is in edit mode based on callback presence
    const isEditable = Boolean(data.onEdit || data.onAdd || data.onDelete);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Update edit value when label changes externally
    useEffect(() => {
        if (!isEditing) {
            setEditValue(data.label);
        }
    }, [data.label, isEditing]);

    const handleDoubleClick = (e) => {
        if (isEditable && data.onEdit) {
            e.stopPropagation();
            setIsEditing(true);
            setEditValue(data.label);
        }
    };

    const handleSaveEdit = () => {
        if (editValue.trim() && editValue.trim() !== data.label) {
            data.onEdit(editValue.trim());
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditValue(data.label);
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    const handleClick = (e, callback) => {
        e.stopPropagation();
        if (callback) {
            callback();
        }
    };

    return (
        <Paper
            elevation={selected ? 8 : 1}
            onDoubleClick={handleDoubleClick}
            sx={{
                minWidth: 120,
                maxWidth: 280,
                p: 1,
                border: selected ? '2px solid #1976d2' : '1px solid #e0e0e0',
                borderRadius: 2,
                backgroundColor: data.isRoot ? '#e3f2fd' : '#fff',
                color: '#1a1a1a',
                '&:hover': {
                    boxShadow: (theme) => theme.shadows[4]
                },
                userSelect: 'none',
                position: 'relative',
            }}
        >
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                style={{
                    background: '#90caf9',
                    width: 8,
                    height: 8,
                    border: '2px solid #1976d2'
                }}
            />

            <Box
                className="drag-handle"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: isEditable && !isEditing ? 'move' : 'default',
                    gap: 0.5,
                }}
            >
                {isEditing ? (
                    // Inline edit mode
                    <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0.5 }}>
                        <TextField
                            inputRef={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveEdit}
                            size="small"
                            variant="standard"
                            autoFocus
                            sx={{
                                flex: 1,
                                '& .MuiInputBase-input': {
                                    fontSize: '0.875rem',
                                    py: 0.25,
                                    color: '#1a1a1a',
                                },
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <IconButton size="small" onClick={handleSaveEdit} color="success" sx={{ p: 0.25 }}>
                            <CheckIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={handleCancelEdit} sx={{ p: 0.25 }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ) : (
                    // Display mode
                    <>
                        <Typography
                            variant="body2"
                            sx={{
                                wordBreak: 'break-word',
                                flex: 1,
                                fontWeight: data.isRoot ? 600 : 400,
                                mr: 0.5,
                                cursor: isEditable ? 'text' : 'default',
                                color: '#1a1a1a',
                            }}
                            title={isEditable ? 'Double-click to edit' : undefined}
                        >
                            {data.label}
                        </Typography>

                        {/* Action buttons - only show when editable */}
                        {isEditable && (
                            <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                                {data.onAdd && (
                                    <Tooltip title="Add child (Tab)">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => handleClick(e, data.onAdd)}
                                            sx={{ p: 0.25 }}
                                        >
                                            <AddIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}

                                {data.onDelete && !data.isRoot && (
                                    <Tooltip title="Delete (Del)">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => handleClick(e, data.onDelete)}
                                            color="error"
                                            sx={{ p: 0.25 }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        )}
                    </>
                )}
            </Box>

            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                style={{
                    background: '#90caf9',
                    width: 8,
                    height: 8,
                    border: '2px solid #1976d2'
                }}
            />
        </Paper>
    );
}

export default memo(MindMapNode, (prev, next) => {
    const prevHasCallbacks = !!(prev.data.onEdit || prev.data.onAdd || prev.data.onDelete);
    const nextHasCallbacks = !!(next.data.onEdit || next.data.onAdd || next.data.onDelete);

    return prev.data.label === next.data.label &&
           prev.selected === next.selected &&
           prevHasCallbacks === nextHasCallbacks;
});