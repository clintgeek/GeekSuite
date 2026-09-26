/** Documents: receipts, manuals, registrations — open in a new tab or download. */
import React from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import {
  DescriptionOutlined as TextIcon,
  FileDownloadOutlined as DownloadIcon,
  ImageOutlined as ImageIcon,
  OpenInNew as OpenIcon,
  PictureAsPdfOutlined as PdfIcon,
} from '@mui/icons-material';
import Section from './Section';
import { documentRoleLabel } from '../../utils/vocab';

export function formatBytes(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function DocIcon({ mime }) {
  const sx = { fontSize: 22 };
  if (mime === 'application/pdf') return <PdfIcon sx={sx} />;
  if (mime?.startsWith('image/')) return <ImageIcon sx={sx} />;
  return <TextIcon sx={sx} />;
}

export const documentTitle = (d) => d.title || d.originalName || documentRoleLabel(d.role);

export default function DocumentsSection({ documents = [], uploads = [], onAdd, onRetry }) {
  return (
    <Section
      id="documents"
      title="Documents"
      action={
        <Button size="small" onClick={onAdd} sx={{ color: 'text.primary', fontWeight: 600 }}>
          Add
        </Button>
      }
    >
      {documents.length || uploads.length ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {documents.map((d) => {
            const title = documentTitle(d);
            return (
              <Box component="li" key={d.id} data-testid="document-row" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                  <DocIcon mime={d.mime} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>{title}</Typography>
                  <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {[documentRoleLabel(d.role), formatBytes(d.size)].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Tooltip title="Open">
                  <IconButton component="a" href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title}`} sx={{ color: 'text.secondary' }}>
                    <OpenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Download">
                  <IconButton component="a" href={d.url} download={d.originalName || title} aria-label={`Download ${title}`} sx={{ color: 'text.secondary', mr: -1 }}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
          {uploads.map((u) => (
            <Box component="li" key={u.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                <TextIcon sx={{ fontSize: 22 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>{u.title || u.name}</Typography>
                <Typography noWrap sx={{ fontSize: '0.75rem', color: u.status === 'failed' ? 'error.main' : 'text.secondary' }}>
                  {u.status === 'failed' ? u.error : `Uploading… ${Math.round((u.progress || 0) * 100)}%`}
                </Typography>
              </Box>
              {u.status === 'failed' ? (
                <Button size="small" onClick={() => onRetry(u.key)} sx={{ color: 'text.primary' }}>
                  Retry
                </Button>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          The receipt, the manual, the registration. PDFs, photos and text files, up to 25 MB.
        </Typography>
      )}
    </Section>
  );
}
