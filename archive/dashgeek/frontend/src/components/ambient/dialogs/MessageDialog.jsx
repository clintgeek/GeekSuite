import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Skeleton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import DOMPurify from 'dompurify';

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export default function MessageDialog({ open, onClose, messageId }) {
  const theme = useTheme();
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !messageId) return undefined;
    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/ambient/gmail/messages/${encodeURIComponent(messageId)}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.status === 409) {
          setError('Reconnect Gmail to view this message.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Unable to load message.');
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load message.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, messageId]);

  const sanitizedHtml = data?.body_html
    ? DOMPurify.sanitize(data.body_html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick'],
      })
    : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="message-dialog-title"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)' } },
      }}
    >
      <DialogTitle
        id="message-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontFamily: monoStack,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        Email
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="text" width="40%" height={18} />
            <Skeleton variant="rectangular" width="100%" height={200} sx={{ mt: 2 }} />
          </Box>
        ) : error ? (
          <Typography variant="body2" color="text.secondary">
            {error}
          </Typography>
        ) : data ? (
          <Box>
            <Box sx={{ pb: 2, mb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary' }}>
                {data.subject || '(No subject)'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                {data.from_name ? `${data.from_name} ` : ''}
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {data.from_email ? `<${data.from_email}>` : ''}
                </Box>
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: 'block', color: 'text.disabled', mt: 0.5 }}
              >
                {formatDateTime(data.received_at)}
              </Typography>
            </Box>

            {sanitizedHtml ? (
              <Box
                sx={{
                  color: 'text.primary',
                  fontFamily: theme.typography.body1.fontFamily,
                  fontSize: '0.9375rem',
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                  '& a': { color: theme.palette.primary.main },
                  '& img': { maxWidth: '100%', height: 'auto' },
                  '& table': { maxWidth: '100%' },
                }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : data.body_text ? (
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {data.body_text}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.disabled">
                (Empty message)
              </Typography>
            )}
          </Box>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
