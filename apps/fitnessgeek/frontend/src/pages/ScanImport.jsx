import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { SectionLabel, DisplayHeading } from '../components/primitives';
import { fetchStagedShareFile, uploadBodyCompFile } from '../services/bodyCompUploadService.js';

// Minimal intake screen. This is where BOTH ways of getting a scan file
// into the app land:
//   1. Android share sheet -> Web Share Target POST /share-target -> the
//      backend stages the bytes and 303-redirects here with ?stagedId=...
//      (see shareTargetController.js for the full CSRF reasoning).
//   2. The plain <input type="file"> below — the permanent fallback, since
//      iOS Safari implements outbound navigator.share() only, never Web
//      Share Target, and it's also useful on desktop / for re-importing an
//      old scan.
// Both paths call the same POST /api/body-comp/uploads endpoint. A later
// pass builds the real confirm/review UI on top of this; this screen only
// proves the file arrived and got stored.

const ERROR_MESSAGES = {
  no_file: 'No file was shared.',
  unsupported_type: 'That file type is not supported. Share a PDF or an image.',
  file_too_large: 'That file is too large.',
  server_error: 'Something went wrong receiving the shared file.',
};

const STATUS = {
  IDLE: 'idle',
  CLAIMING: 'claiming',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
};

function ScanImport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify } = useToast();
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState(STATUS.IDLE);
  const [fileMeta, setFileMeta] = useState(null); // { name, size, mimeType }
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const runUpload = useCallback(async (file) => {
    setStatus(STATUS.UPLOADING);
    setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
    setErrorMessage(null);
    try {
      const result = await uploadBodyCompFile(file);
      setUploadResult(result);
      setStatus(STATUS.SUCCESS);
      notify('Scan uploaded.', { tone: 'success' });
    } catch (error) {
      setStatus(STATUS.ERROR);
      setErrorMessage(error.message || 'Upload failed.');
      notify(error.message || 'Upload failed.', { tone: 'error' });
    }
  }, [notify]);

  // Claim a staged share-target file exactly once per stagedId.
  useEffect(() => {
    const stagedId = searchParams.get('stagedId');
    const shareError = searchParams.get('error');

    if (shareError) {
      setStatus(STATUS.ERROR);
      setErrorMessage(ERROR_MESSAGES[shareError] || 'The shared file could not be received.');
      return;
    }

    if (!stagedId) return;

    let cancelled = false;
    setStatus(STATUS.CLAIMING);
    fetchStagedShareFile(stagedId)
      .then((file) => {
        if (cancelled) return;
        return runUpload(file);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(STATUS.ERROR);
        setErrorMessage(error.message || 'The shared file could not be retrieved.');
      });

    // Clear the query params so a refresh doesn't try to re-claim an
    // already-consumed (single-use) staged id.
    setSearchParams({}, { replace: true });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilePicked = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    runUpload(file);
  };

  const busy = status === STATUS.CLAIMING || status === STATUS.UPLOADING;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Import · Body Scan</SectionLabel>
        <DisplayHeading size="page">Import a scan</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Share a body-composition report from your scale's app, or choose a file below.
        </Typography>
      </Box>

      <Box
        sx={{
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          p: { xs: 2.5, sm: 3 },
          textAlign: 'center',
          bgcolor: 'background.paper',
        }}
      >
        {status === STATUS.IDLE && (
          <>
            <InsertDriveFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ mb: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
              PDF or image, up to 10MB.
            </Typography>
          </>
        )}

        {busy && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress size={32} />
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {status === STATUS.CLAIMING ? 'Retrieving shared file…' : 'Uploading…'}
            </Typography>
          </Box>
        )}

        {status === STATUS.SUCCESS && (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, mb: 0.5 }}>
              Received: {fileMeta?.name}
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 2 }}>
              {uploadResult?.mimeType} · {Math.max(1, Math.round((uploadResult?.size || 0) / 1024))} KB
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Stored. Review and extraction come next.
            </Typography>
          </Box>
        )}

        {status === STATUS.ERROR && (
          <Typography sx={{ fontSize: '0.875rem', color: 'error.main', mb: 2 }}>
            {errorMessage}
          </Typography>
        )}

        <Button
          variant="contained"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={busy}
          sx={{ minHeight: 44, mt: status === STATUS.IDLE ? 0 : 2 }}
        >
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={handleFilePicked}
          />
        </Button>
      </Box>
    </Box>
  );
}

export default ScanImport;
