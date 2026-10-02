/**
 * `/attic/doc/:id` — one document, behind the lock.
 *
 *   images       the card sides / pages, decrypted by the backend for this
 *                session only (no-store; the service worker never keeps them)
 *   numbers      masked — no partial digits, ever. Reveal is per field, each
 *                one audit-logged; a strict number (the SSN) hides itself
 *                again after 15 seconds, others after a minute. A revealed
 *                value lives only in this row's state.
 *   details      plain fields, dates, people, linked things, notes
 *   actions      edit, add an image, remove one, delete the document
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import {
  ContentCopyOutlined as CopyIcon,
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  FileDownloadOutlined as DownloadIcon,
  OpenInNew as OpenIcon,
  PictureAsPdfOutlined as PdfIcon,
  VisibilityOffOutlined as HideIcon,
  VisibilityOutlined as RevealIcon,
} from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { GeekErrorState, GeekSheet, useToast } from '@geeksuite/ui';
import SectionHeading from '../../components/SectionHeading';
import TypeIcon from '../../components/TypeIcon';
import { thingPath } from '../../components/navConfig';
import { DELETE_ATTIC_DOCUMENT, GET_ATTIC_DOCUMENT, GET_ATTIC_HOME, UPDATE_ATTIC_DOCUMENT } from '../../graphql/attic';
import { atticFileUrl, revealIdentifier, uploadAtticFile } from '../../api/attic';
import { useLockOnError, useVault } from '../../hooks/useVault';
import { DISPLAY_FONT, MONO_FONT } from '../../theme/theme';
import { formatCalendarDate } from '../../utils/dates';
import { AtticGate, HERO_BUTTON_SX } from './AtticLock';
import { ExpiryLine, panelSx } from './AtticParts';
import { AtticTypeIcon, captureSlotsFor, sideLabelFor } from './atticIcons';
import { CaptureSlot } from './CardCapture';

export const MASK = '••••••••';
export const STRICT_HIDE_MS = 15000;
export const PLAIN_HIDE_MS = 60000;

export function IdentifierRow({ documentId, identifier, onLocked }) {
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(null);
  const timer = useRef(null);
  const { notify } = useToast();

  useEffect(() => () => clearInterval(timer.current), []);

  const hide = () => {
    clearInterval(timer.current);
    setValue(null);
    setLeft(null);
  };

  const reveal = async () => {
    setBusy(true);
    setErr('');
    try {
      const v = await revealIdentifier(documentId, identifier.key);
      setValue(v ?? '');
      const ms = identifier.strict ? STRICT_HIDE_MS : PLAIN_HIDE_MS;
      const until = Date.now() + ms;
      setLeft(Math.round(ms / 1000));
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        const s = Math.round((until - Date.now()) / 1000);
        if (s <= 0) hide();
        else setLeft(s);
      }, 1000);
    } catch (e) {
      onLocked?.(e);
      setErr(e?.message || 'Couldn’t reveal it.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify('Copied. Paste it, then copy something else over it.', { tone: 'info' });
    } catch {
      notify('This browser wouldn’t copy it.', { tone: 'error' });
    }
  };

  const shown = value !== null;
  return (
    <Box role="group" aria-label={identifier.label} data-testid="identifier-row" data-key={identifier.key} data-revealed={shown ? 'true' : 'false'} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 160 }}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontWeight: 600 }}>
          {identifier.label}
          {identifier.strict ? ' · most sensitive' : ''}
        </Typography>
        {identifier.hasValue ? (
          <Typography data-testid="identifier-value" sx={{ fontFamily: MONO_FONT, fontSize: '1.0625rem', fontWeight: 600, letterSpacing: shown ? '0.06em' : '0.2em', color: 'text.primary', wordBreak: 'break-all' }}>
            {shown ? value : <span aria-label="hidden">{MASK}</span>}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>Not on file</Typography>
        )}
        {shown && left != null ? (
          <Typography role="status" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Hides in {left} s · this reveal was logged
          </Typography>
        ) : null}
        {err ? (
          <Typography role="alert" sx={{ fontSize: '0.8125rem', color: 'status.overdue', fontWeight: 700 }}>
            {err}
          </Typography>
        ) : null}
      </Box>
      {identifier.hasValue ? (
        shown ? (
          <>
            {!identifier.strict ? (
              <Tooltip title="Copy">
                <IconButton aria-label={`Copy ${identifier.label}`} onClick={copy} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
                  <CopyIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            <Button onClick={hide} startIcon={<HideIcon />} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }}>
              Hide
            </Button>
          </>
        ) : (
          <Button onClick={reveal} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <RevealIcon />} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }} aria-label={`Reveal ${identifier.label}`}>
            Reveal
          </Button>
        )
      ) : null}
    </Box>
  );
}

function FileCard({ file, type, title, onRemove }) {
  const label = `${sideLabelFor(type, file.side)}${file.caption ? ` — ${file.caption}` : ''}`;
  const isImage = file.mime?.startsWith('image/') && !/hei[cf]/.test(file.mime);
  return (
    <Box component="figure" data-testid="attic-file" data-side={file.side} sx={{ m: 0, border: 1, borderColor: 'border', borderRadius: '6px', bgcolor: 'background.paper', overflow: 'hidden', display: 'grid' }}>
      <Box component="a" href={atticFileUrl(file.fileId)} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${label.toLowerCase()} of ${title}`} sx={{ display: 'block', bgcolor: '#111', aspectRatio: file.side === 'page' ? '3 / 4' : '85.6 / 54', maxHeight: 360 }}>
        {isImage ? (
          <Box component="img" src={file.url} alt={`${label} of ${title}`} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        ) : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: '#EEE' }}>
            <PdfIcon aria-hidden="true" sx={{ fontSize: 48 }} />
          </Box>
        )}
      </Box>
      <Box component="figcaption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, minHeight: 48 }}>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', fontWeight: 700 }} noWrap>
          {label}
        </Typography>
        <Tooltip title="Open">
          <IconButton component="a" href={atticFileUrl(file.fileId)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
            <OpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Download">
          <IconButton component="a" href={atticFileUrl(file.fileId, { download: true })} aria-label={`Download ${label}`} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Remove">
          <IconButton aria-label={`Remove ${label}`} onClick={onRemove} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

function Ledger({ label, children }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
      <Typography sx={{ minWidth: 140, fontSize: '0.875rem', color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', color: 'text.primary' }}>{children}</Box>
    </Box>
  );
}

function DocumentBody({ doc, refetch }) {
  const vault = useVault();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [update] = useMutation(UPDATE_ATTIC_DOCUMENT);
  const [remove, { loading: removing }] = useMutation(DELETE_ATTIC_DOCUMENT, { refetchQueries: [GET_ATTIC_HOME] });
  const type = doc.type;
  const slots = captureSlotsFor(type);

  const removeFile = async (file) => {
    try {
      await update({ variables: { id: doc.id, input: { files: doc.files.filter((f) => f.id !== file.id).map((f) => ({ id: f.id })) } } });
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'Couldn’t remove it.', { tone: 'error' });
    }
  };

  const addFile = async (file, side) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadAtticFile(doc.id, { file, side });
      setAdding(null);
      await refetch();
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'That didn’t upload.', { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const del = async () => {
    try {
      await remove({ variables: { id: doc.id } });
      notify(`${doc.title} is gone from the Attic.`, { tone: 'success' });
      navigate('/attic', { replace: true });
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'Couldn’t delete it.', { tone: 'error' });
    }
  };

  const missingSides = slots.filter((s) => s !== 'page' && !doc.files.some((f) => f.side === s));

  return (
    <Box data-testid="attic-doc" sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: '6px', display: 'grid', placeItems: 'center', bgcolor: 'steel.door', color: 'steel.text', border: '2px solid', borderColor: 'steel.frame' }}>
          <AtticTypeIcon name={type?.icon} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' }, lineHeight: 1.15 }}>
            {doc.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{[type?.name, doc.people.map((p) => p.name).join(' & ')].filter(Boolean).join(' · ')}</Typography>
          <ExpiryLine expiry={doc.expiry} expires={doc.expires} sx={{ display: 'block', mt: 0.25 }} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to={`/attic/edit/${encodeURIComponent(doc.id)}`} variant="outlined" startIcon={<EditIcon />} sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border' }}>
          Edit
        </Button>
        <Button onClick={() => setConfirm(true)} startIcon={<DeleteIcon />} sx={{ minHeight: 44, color: 'text.primary' }}>
          Delete
        </Button>
      </Box>

      <Box component="section" aria-labelledby="attic-doc-images" sx={panelSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, minHeight: 32 }}>
          <SectionHeading id="attic-doc-images" count={doc.files.length}>
            Images
          </SectionHeading>
          <Button onClick={() => setAdding(missingSides[0] ?? 'page')} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }}>
            Add
          </Button>
        </Box>
        {doc.files.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            {doc.files.map((f) => (
              <FileCard key={f.id} file={f} type={type} title={doc.title} onRemove={() => removeFile(f)} />
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No images yet. A photo of each side is what you’ll want on a bad day.</Typography>
        )}
      </Box>

      {doc.identifiers.length ? (
        <Box component="section" aria-labelledby="attic-doc-numbers" sx={panelSx}>
          <SectionHeading id="attic-doc-numbers">Numbers</SectionHeading>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>Masked until you reveal one. Each reveal is logged in Recent access.</Typography>
          {doc.identifiers.map((i) => (
            <IdentifierRow key={i.key} documentId={doc.id} identifier={i} onLocked={vault.handleError} />
          ))}
        </Box>
      ) : null}

      <Box component="section" aria-labelledby="attic-doc-details" sx={panelSx}>
        <SectionHeading id="attic-doc-details">Details</SectionHeading>
        <Box sx={{ mt: 0.5 }}>
          {type?.issuedLabel && doc.issued ? <Ledger label={type.issuedLabel}>{formatCalendarDate(doc.issued)}</Ledger> : null}
          {type?.expiryLabel && doc.expires ? <Ledger label={type.expiryLabel}>{formatCalendarDate(doc.expires)}</Ledger> : null}
          {doc.fields.filter((f) => f.value !== null && f.value !== '').map((f) => (
            <Ledger key={f.key} label={f.label}>
              {f.kind === 'date' ? formatCalendarDate(f.value) : String(f.value)}
            </Ledger>
          ))}
          {doc.links.length ? (
            <Ledger label="Linked things">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {doc.links.map((t) => (
                  <Chip key={t.id} component={RouterLink} to={thingPath(t.id)} clickable label={t.name} icon={<TypeIcon name={t.type?.icon} sx={{ fontSize: 18 }} />} sx={{ minHeight: 36, fontWeight: 600 }} />
                ))}
              </Box>
            </Ledger>
          ) : null}
          {doc.notes ? <Ledger label="Notes"><Box sx={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</Box></Ledger> : null}
        </Box>
      </Box>

      <GeekSheet
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        title="Add an image"
        actions={
          uploading ? <CircularProgress size={24} aria-label="Uploading" /> : null
        }
      >
        <Box sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
          {(slots.includes('back') ? ['front', 'back'] : slots).map((s) => (
            <CaptureSlot key={s} testId={`add-${s}`} label={sideLabelFor(type, s)} card={s !== 'page'} value={null} onChange={(f) => addFile(f, s)} />
          ))}
        </Box>
      </GeekSheet>

      <GeekSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${doc.title}?`}
        description="It leaves every view at once, and its sealed images are erased within the hour. There’s no Trash for the Attic."
        actions={
          <>
            <Button onClick={() => setConfirm(false)} sx={{ minHeight: 44, color: 'text.primary' }}>
              Keep it
            </Button>
            <Button onClick={del} disabled={removing} variant="contained" sx={HERO_BUTTON_SX}>
              Delete
            </Button>
          </>
        }
      >
        <span />
      </GeekSheet>
    </Box>
  );
}

function DocumentLoader() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useQuery(GET_ATTIC_DOCUMENT, { variables: { id }, fetchPolicy: 'cache-and-network' });
  useLockOnError(error);
  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
        <CircularProgress size={28} aria-label="Loading" />
      </Box>
    );
  }
  if (error && !data) return <GeekErrorState title="This didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  if (!data?.atticDocument) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ fontWeight: 700 }}>Not in the Attic</Typography>
        <Button component={RouterLink} to="/attic" sx={{ mt: 1, minHeight: 44, color: 'text.primary' }}>
          Back to the Attic
        </Button>
      </Box>
    );
  }
  return <DocumentBody doc={data.atticDocument} refetch={refetch} />;
}

export default function AtticDocumentPage() {
  return (
    <AtticGate title="Document" what="This document">
      <DocumentLoader />
    </AtticGate>
  );
}
