/**
 * Add a photo or a document to a thing: say what it is (the role — an
 * ID-plate photo is not an overview), optionally a caption or title, then
 * take it with the camera or pick a file. The upload runs in the app-wide
 * queue (hooks/useUploads.jsx), so closing this sheet never cancels it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { FolderOpenOutlined as FileIcon, PhotoCameraOutlined as CameraIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import RoleChips from '../../components/RoleChips';
import { documentRoleLabel, photoRoleLabel } from '../../utils/vocab';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/*';
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,text/plain';

export default function AddFileSheet({ open, kind = 'photo', initialRole, roles, onClose, onFile, thingName }) {
  const isPhoto = kind === 'photo';
  const [role, setRole] = useState(initialRole || (isPhoto ? 'overview' : 'receipt'));
  const [text, setText] = useState('');
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRole(initialRole || (isPhoto ? 'overview' : 'receipt'));
      setText('');
    }
  }, [open, initialRole, isPhoto]);

  const picked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onFile({ file, kind, role, caption: isPhoto ? text.trim() || undefined : undefined, title: isPhoto ? undefined : text.trim() || undefined });
    onClose();
  };

  return (
    <GeekSheet open={open} onClose={onClose} title={isPhoto ? 'Add a photo' : 'Add a document'} description={thingName}>
      <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
        {isPhoto ? 'This photo shows' : 'This document is'}
      </Typography>
      <RoleChips roles={roles} value={role} onChange={setRole} label={isPhoto ? 'Photo role' : 'Document role'} labelFor={isPhoto ? photoRoleLabel : documentRoleLabel} />
      <TextField
        fullWidth
        size="small"
        label={isPhoto ? 'Caption (optional)' : 'Title (optional)'}
        placeholder={isPhoto ? 'Port side, after the new decals' : 'Bass Pro receipt, May 2023'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        inputProps={{ maxLength: 200 }}
        sx={{ mt: 2 }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: isPhoto ? '1fr 1fr' : '1fr', gap: 1, mt: 2, pb: 1 }}>
        {isPhoto ? (
          <Button variant="contained" startIcon={<CameraIcon />} onClick={() => cameraRef.current?.click()}>
            Take a photo
          </Button>
        ) : null}
        <Button variant={isPhoto ? 'outlined' : 'contained'} startIcon={<FileIcon />} onClick={() => fileRef.current?.click()} sx={isPhoto ? { color: 'text.primary' } : undefined}>
          Choose a file
        </Button>
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
        {isPhoto ? 'JPEG, PNG, WebP or HEIC, up to 25 MB.' : 'PDF, an image or a text file, up to 25 MB.'}
      </Typography>
      {isPhoto ? (
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={picked} data-testid="camera-input" aria-hidden="true" tabIndex={-1} />
      ) : null}
      <input ref={fileRef} type="file" accept={isPhoto ? PHOTO_ACCEPT : DOCUMENT_ACCEPT} hidden onChange={picked} data-testid="file-input" aria-hidden="true" tabIndex={-1} />
    </GeekSheet>
  );
}
