import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
// Deep imports (see RichTextEditor.jsx for why), not the barrel.
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import RotateRight from '@mui/icons-material/RotateRight';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useToast } from '@geeksuite/ui';
import { CREATE_NOTE, COMPOSE_NOTE, TRANSCRIBE_SKETCH } from '../graphql/mutations';
import { onNoteCreated } from '../graphql/cacheUpdates';
import TranscribeDialog from '../components/editors/TranscribeDialog';
import ComposeDialog from '../components/editors/ComposeDialog';
import TagSelector from '../components/TagSelector';
import { BackButton } from '../components/notes/NoteActions';
import { saveErrorMessage } from '../utils/saveGuards';
import { derivedNoteContent, derivedNoteTitle } from '../utils/sketchToText';
import {
  PHOTO_MAX_PAGES,
  PHOTO_MEDIA_TYPE,
  acceptPages,
  joinPageTranscripts,
  photoNoteTitle,
  keptCopy,
  photoSizeCheck,
  preparePhotoPageSet,
  rotateBy,
} from '../utils/photoPages';
import { dotGridBackground, layout, noteTypeInk, stampFill, surfaces } from '../theme/tokens';

/**
 * PhotoPagesPage — "Photo of a page" (DOCS/HANDWRITING.md §3).
 *
 * Photograph notebook pages; read each one with the vision model; correct
 * the reading; then keep two new notes: a **photo sketch note** (each page an
 * image shape you can mark up with the S Pen) and a **Markdown note** whose
 * first line links back to it. Nothing existing is ever changed.
 *
 * Order of events, and why:
 *   - Pages are prepared as they arrive (upright, turned, ≤2000px, JPEG 0.85),
 *     one at a time: decoding several 12 MP photos at once is how a phone
 *     tab runs out of memory.
 *   - The size guard runs on the tray, so "too big for one note" is said
 *     before a single page is read or anything is created.
 *   - Pages are read one call each, in page order, with progress. A failure
 *     stops the run and keeps what was read: "Try again" carries on from the
 *     failed page, so a retry does not spend the cap twice.
 *   - Both notes are created only when the writer keeps the result. The photo
 *     note goes first, because the Markdown note links to its id.
 */

const button = (theme) => ({ textTransform: 'none', [theme.breakpoints.down('md')]: { minHeight: 44 } });

const kb = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`);

let keySeq = 0;
const nextKey = () => `p${Date.now().toString(36)}${(keySeq += 1)}`;

/** Which reading belongs to which page as it is now (turning a page re-reads it). */
const readingKey = (p) => `${p.key}:${p.rotation}`;

function composeOutcome(result) {
  const reason = result?.provenance?.reason;
  const base = { open: true, loading: false, stats: result?.stats || null, model: result?.provenance?.model || null };
  if (reason === 'content_too_long') {
    return { ...base, markdown: '', error: 'That is more material than one compose can take. Keep it as plain text, or split the pages across two notes.' };
  }
  if (reason === 'degenerate_output') {
    return { ...base, markdown: '', error: 'The model got stuck repeating itself, so that result was thrown away. Try again; it may land on a better model.' };
  }
  if (!result?.markdown?.trim()) {
    return { ...base, markdown: '', error: 'Compose is unavailable right now. Your transcript is kept.' };
  }
  return { ...base, markdown: result.markdown, error: null };
}

function PageRow({ page, index, count, onRotate, onRemove, onMove, busy }) {
  const theme = useTheme();
  const mono = { fontFamily: theme.typography.fontFamilyMono };
  const n = index + 1;
  const small = { [theme.breakpoints.down('md')]: { width: 44, height: 44 } };
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        gap: 3,
        alignItems: 'flex-start',
        p: 3,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: surfaces(theme).elevated,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 96,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          border: 1,
          borderColor: 'divider',
          borderRadius: '2px',
          bgcolor: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {page.url ? (
          <Box
            component="img"
            src={page.url}
            alt={`Page ${n}`}
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : page.status === 'preparing' ? (
          <CircularProgress size={20} aria-label={`Preparing page ${n}`} />
        ) : null}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
            Page {n}
          </Typography>
          <Typography variant="caption" component="p" sx={{ ...mono, color: 'text.secondary' }}>
            {page.status === 'ready' && page.prepared
              ? `${page.prepared.width}×${page.prepared.height} · ${kb(page.prepared.bytes)}`
              : page.status === 'preparing' ? 'Preparing…' : ''}
          </Typography>
          {page.status === 'error' ? (
            <Typography variant="body2" role="alert" sx={{ color: 'error.main', mt: 1 }}>
              {page.error}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="Rotate a quarter turn">
            <span>
              <IconButton
                aria-label={`Rotate page ${n}`}
                onClick={onRotate}
                disabled={busy || page.status === 'error'}
                size="small"
                sx={small}
              >
                <RotateRight fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move up">
            <span>
              <IconButton aria-label={`Move page ${n} up`} onClick={() => onMove(-1)} disabled={busy || index === 0} size="small" sx={small}>
                <ArrowUpward fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move down">
            <span>
              <IconButton aria-label={`Move page ${n} down`} onClick={() => onMove(1)} disabled={busy || index === count - 1} size="small" sx={small}>
                <ArrowDownward fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Remove">
            <span>
              <IconButton aria-label={`Remove page ${n}`} onClick={onRemove} disabled={busy} size="small" sx={small}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
}

export default function PhotoPagesPage({ prepare = preparePhotoPageSet, loadSnapshotBuilder = null }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { notify } = useToast();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const coarse = useMediaQuery('(pointer: coarse)');
  const canCapture = phone || coarse;
  const ink = noteTypeInk(theme, 'handwritten');
  const mono = { fontFamily: theme.typography.fontFamilyMono };

  const [pages, setPages] = useState([]);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState([]);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [transcribe, setTranscribe] = useState(null);
  const [compose, setCompose] = useState(null);

  const cameraRef = useRef(null);
  const filesRef = useRef(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const queueRef = useRef(Promise.resolve());
  const versionRef = useRef(new Map()); // page key -> preparation version
  const readingsRef = useRef(new Map()); // readingKey -> text
  const reviewedRef = useRef(null); // { signature, text } — the last review, corrections kept
  const photoNoteRef = useRef(null); // { signature, id, title } — created at most once per page set
  const runRef = useRef(0);
  const urlsRef = useRef(new Set());

  const [createNoteMutation] = useMutation(CREATE_NOTE, { update: onNoteCreated });
  const [transcribeMutation] = useMutation(TRANSCRIBE_SKETCH);
  const [composeMutation] = useMutation(COMPOSE_NOTE);

  // Object URLs are revoked when replaced, removed, and on the way out.
  const track = (url) => { if (url) urlsRef.current.add(url); return url; };
  const revoke = (url) => {
    if (url && urlsRef.current.has(url)) {
      urlsRef.current.delete(url);
      URL.revokeObjectURL?.(url);
    }
  };
  useEffect(() => () => {
    runRef.current += 1;
    for (const url of urlsRef.current) URL.revokeObjectURL?.(url);
    urlsRef.current.clear();
  }, []);

  const updatePage = (key, patch) => setPages((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  /** Prepare (or re-prepare) one page, queued behind any other preparation. */
  const schedulePrepare = useCallback((key, file, rotation) => {
    const version = (versionRef.current.get(key) || 0) + 1;
    versionRef.current.set(key, version);
    queueRef.current = queueRef.current.then(async () => {
      if (versionRef.current.get(key) !== version) return; // superseded or removed
      try {
        const prepared = await prepare(file, rotation);
        if (versionRef.current.get(key) !== version) return;
        const url = typeof URL.createObjectURL === 'function' ? track(URL.createObjectURL(prepared.blob)) : null;
        setPages((list) => list.map((p) => {
          if (p.key !== key) return p;
          revoke(p.url);
          return { ...p, status: 'ready', prepared, url, error: null };
        }));
      } catch (err) {
        if (versionRef.current.get(key) !== version) return;
        updatePage(key, { status: 'error', error: err?.message || 'Could not prepare that photo.' });
      }
    });
  }, [prepare]);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const { accepted, message } = acceptPages(pagesRef.current.length, files.length);
    setNotice(message);
    const added = files.slice(0, accepted).map((file) => ({ key: nextKey(), file, rotation: 0, status: 'preparing', prepared: null, url: null, error: null }));
    if (!added.length) return;
    setPages((list) => [...list, ...added]);
    for (const p of added) schedulePrepare(p.key, p.file, 0);
  }, [schedulePrepare]);

  const onPicked = (e) => {
    addFiles(e.target.files);
    e.target.value = ''; // the same photo can be picked again
  };

  const rotatePage = (key) => {
    const p = pagesRef.current.find((x) => x.key === key);
    if (!p) return;
    const rotation = rotateBy(p.rotation, 90);
    updatePage(key, { rotation, status: 'preparing' });
    schedulePrepare(key, p.file, rotation);
  };

  const removePage = (key) => {
    versionRef.current.delete(key);
    setPages((list) => {
      const gone = list.find((p) => p.key === key);
      revoke(gone?.url);
      return list.filter((p) => p.key !== key);
    });
    setNotice(null);
  };

  const movePage = (index, delta) => setPages((list) => {
    const to = index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  });

  const ready = pages.filter((p) => p.status === 'ready');
  const preparing = pages.some((p) => p.status === 'preparing');
  const failed = pages.some((p) => p.status === 'error');
  // The note holds the KEPT copies; the model reads the full-size ones.
  const size = photoSizeCheck(ready.map((p) => ({ bytes: keptCopy(p.prepared).bytes })));
  const signature = pages.map(readingKey).join('|');
  const canRead = pages.length > 0 && !preparing && !failed && size.ok && !transcribe;
  const photoTitle = photoNoteTitle(title);

  // ── Reading the pages ─────────────────────────────────────────────────

  const readPages = async () => {
    const list = pagesRef.current.filter((p) => p.status === 'ready');
    if (!list.length) return;
    const sig = list.map(readingKey).join('|');
    const strip = list.map((p, i) => ({ key: p.key, url: p.url, label: `Page ${i + 1}` }));

    // Back from the review with the same pages: the corrected text is kept.
    if (reviewedRef.current?.signature === sig) {
      setTranscribe({ open: true, stage: 'review', step: 'read', progress: null, text: reviewedRef.current.text, model: reviewedRef.current.model, error: null, saving: false, pages: strip });
      return;
    }

    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    let model = null;
    setTranscribe({ open: true, stage: 'working', step: 'read', progress: { current: 1, total: list.length }, text: '', model: null, error: null, saving: false, pages: strip });

    // One call per page, strictly in page order; a page read earlier (and not
    // turned since) is not read again.
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      if (readingsRef.current.has(readingKey(p))) continue;
      setTranscribe((t) => (t ? { ...t, stage: 'working', progress: { current: i + 1, total: list.length } } : t));
      try {
        const { data } = await transcribeMutation({
          variables: { image: p.prepared.base64, mediaType: PHOTO_MEDIA_TYPE, source: 'photo' },
        });
        if (stale()) return;
        const text = data?.transcribeSketch?.text;
        if (!text?.trim()) throw new Error(`The model read nothing back from page ${i + 1}. Try again.`);
        readingsRef.current.set(readingKey(p), text);
        model = data?.transcribeSketch?.provenance?.model || model;
      } catch (err) {
        if (stale()) return;
        const status = err?.networkError?.statusCode;
        const why = status === 413
          ? 'That page is too large for the server to accept (413).'
          : err?.graphQLErrors?.length || !err?.networkError ? saveErrorMessage(err) : 'Could not reach the server.';
        const kept = i > 0 ? ` Pages 1–${i} are read; Try again carries on from page ${i + 1}.` : '';
        setTranscribe((t) => (t ? { ...t, stage: 'error', error: `Page ${i + 1} of ${list.length}: ${why}${kept}` } : t));
        return;
      }
    }
    if (stale()) return;
    const text = joinPageTranscripts(list.map((p) => readingsRef.current.get(readingKey(p))));
    setTranscribe((t) => (t ? { ...t, stage: 'review', progress: null, text, model } : t));
  };

  const backToPages = () => {
    runRef.current += 1; // anything still in flight is now stale
    setTranscribe((t) => {
      if (t?.stage === 'review') reviewedRef.current = { signature, text: t.text, model: t.model };
      return null;
    });
  };

  // ── Keeping the result: two NEW notes, photos first ───────────────────

  const saveResult = async (body, { composed }) => {
    try {
      const list = pagesRef.current.filter((p) => p.status === 'ready');
      const sig = list.map(readingKey).join('|');
      if (photoNoteRef.current?.signature !== sig) {
        const { buildPhotoSketchSnapshot } = loadSnapshotBuilder
          ? await loadSnapshotBuilder()
          : await import('../utils/photoSketchSnapshot');
        const snapshot = buildPhotoSketchSnapshot(list.map((p) => ({
          dataUrl: keptCopy(p.prepared).dataUrl, width: keptCopy(p.prepared).width, height: keptCopy(p.prepared).height, bytes: keptCopy(p.prepared).bytes,
        })));
        const exact = photoSizeCheck(null, { chars: snapshot.length });
        if (!exact.ok) {
          notify(exact.message, { tone: 'error' });
          return false;
        }
        const { data } = await createNoteMutation({
          variables: { title: photoTitle, content: snapshot, type: 'handwritten', tags },
        });
        const id = data?.createNote?.id;
        if (!id) throw new Error('The photos were not saved. Try again.');
        photoNoteRef.current = { signature: sig, id, title: photoTitle };
      }
      const { id: sketchId, title: sketchTitle } = photoNoteRef.current;
      let created;
      try {
        const { data } = await createNoteMutation({
          variables: {
            title: derivedNoteTitle({ sketchTitle, body, composed, source: 'photo' }),
            content: derivedNoteContent({ sketchId, sketchTitle, body, composed, source: 'photo' }),
            type: 'markdown',
            tags,
          },
        });
        created = data?.createNote;
      } catch (err) {
        // The photos are safe; only the text note failed. A retry reuses the
        // photo note rather than making a second one.
        notify(`The photos are saved as a sketch note, but the text note wasn't: ${saveErrorMessage(err)}`, { tone: 'error' });
        return false;
      }
      runRef.current += 1;
      setTranscribe(null);
      setCompose(null);
      notify('Saved: the photos as a sketch note, and the text as a new note.', { tone: 'success' });
      if (created?.id) navigate(`/notes/${created.id}`);
      return true;
    } catch (err) {
      notify(saveErrorMessage(err), { tone: 'error' });
      return false;
    }
  };

  const keepPlain = async () => {
    if (!transcribe?.text?.trim()) return;
    setTranscribe((t) => ({ ...t, saving: true }));
    const ok = await saveResult(transcribe.text, { composed: false });
    if (!ok) setTranscribe((t) => (t ? { ...t, saving: false } : t));
  };

  const composeIt = async () => {
    const source = transcribe?.text;
    if (!source?.trim()) return;
    // Hidden, not closed: "Back to transcript" returns to it.
    setTranscribe((t) => ({ ...t, open: false }));
    setCompose({ open: true, loading: true, markdown: '', stats: null, error: null, model: null });
    try {
      const { data } = await composeMutation({ variables: { content: source } });
      setCompose(composeOutcome(data?.composeNote));
    } catch (err) {
      setCompose({ open: true, loading: false, markdown: '', stats: null, error: err?.message || 'Could not compose the transcript.', model: null });
    }
  };

  // ── Drag and drop (desktop) ───────────────────────────────────────────

  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      addFiles([...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type) || /\.(hei[cf])$/i.test(f.name)));
    },
  };

  const full = pages.length >= PHOTO_MAX_PAGES;
  const busy = Boolean(transcribe);

  const addButtons = (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {canCapture ? (
        <Button
          variant={pages.length ? 'outlined' : 'contained'}
          startIcon={<PhotoCameraOutlined />}
          onClick={() => cameraRef.current?.click()}
          disabled={full || busy}
          sx={button(theme)}
        >
          {pages.length ? 'Add another page' : 'Take a photo'}
        </Button>
      ) : null}
      <Button
        variant={!canCapture && !pages.length ? 'contained' : 'outlined'}
        color={canCapture ? 'inherit' : 'primary'}
        startIcon={<AddPhotoAlternateOutlined />}
        onClick={() => filesRef.current?.click()}
        disabled={full || busy}
        sx={button(theme)}
      >
        {canCapture ? 'Choose photos' : pages.length ? 'Add another page' : 'Choose photos'}
      </Button>
    </Box>
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        [theme.breakpoints.up('md')]: dotGridBackground(theme),
      }}
    >
      <Box
        component="main"
        sx={{
          width: '100%',
          maxWidth: layout.measure,
          mx: 'auto',
          py: { xs: 4, sm: 8 },
          px: { xs: 4, sm: 6 },
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <Box sx={{ ml: '-6px' }}>
          <BackButton onBack={() => navigate(-1)} />
        </Box>

        <Box>
          <Typography variant="h6" component="p" sx={{ color: 'text.secondary', mb: 2 }}>
            New page
          </Typography>
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', sm: '2rem' }, letterSpacing: '-0.025em' }}>
            Photo of a page
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2, maxWidth: '60ch' }}>
            Photograph notebook pages, up to {PHOTO_MAX_PAGES}. They are read into text you can correct,
            then kept as a sketch note you can mark up, with the text as a new note linked to it.
          </Typography>
        </Box>

        {/* Hidden inputs: the camera (phones) and a file picker (everywhere). */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPicked}
          hidden
          data-photo-input="camera"
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          ref={filesRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPicked}
          hidden
          data-photo-input="files"
          aria-hidden="true"
          tabIndex={-1}
        />

        {notice ? (
          <Alert severity="info" onClose={() => setNotice(null)}>{notice}</Alert>
        ) : null}

        {pages.length === 0 ? (
          <Box
            {...dropProps}
            sx={{
              p: { xs: 6, sm: 8 },
              border: `1px dashed ${dragging ? ink : theme.palette.divider}`,
              borderRadius: 1,
              bgcolor: dragging ? stampFill(theme, ink) : surfaces(theme).elevated,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 44, height: 44, display: 'grid', placeItems: 'center',
                borderRadius: '3px', border: `1px solid ${alpha(ink, 0.42)}`, bgcolor: stampFill(theme, ink), color: ink,
              }}
            >
              <PhotoCameraOutlined />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {canCapture ? 'Hold the phone over the page, square to it, in good light.' : 'Choose photos of your pages, or drop them here.'}
            </Typography>
            {addButtons}
          </Box>
        ) : (
          <Box component="section" aria-label="Pages" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }} {...dropProps}>
            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pages.map((p, i) => (
                <PageRow
                  key={p.key}
                  page={p}
                  index={i}
                  count={pages.length}
                  busy={busy}
                  onRotate={() => rotatePage(p.key)}
                  onRemove={() => removePage(p.key)}
                  onMove={(d) => movePage(i, d)}
                />
              ))}
            </Box>
            {addButtons}
          </Box>
        )}

        {pages.length ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={photoNoteTitle('')}
              helperText="For the photos. The text note is titled from its first heading."
              fullWidth
              FormHelperTextProps={{ sx: { ...mono, fontSize: '0.75rem', mx: 0 } }}
            />
            <TagSelector selectedTags={tags} onChange={setTags} />

            {!size.ok ? <Alert severity="error">{size.message}</Alert> : null}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              <Typography variant="caption" component="p" sx={{ ...mono, color: 'text.secondary', letterSpacing: '0.04em', flex: 1, minWidth: 0 }}>
                {pages.length} of {PHOTO_MAX_PAGES} pages · {size.label}
              </Typography>
              <Button variant="contained" onClick={readPages} disabled={!canRead} sx={button(theme)}>
                {pages.length > 1 ? `Read ${pages.length} pages` : 'Read the page'}
              </Button>
            </Box>
          </Box>
        ) : null}
      </Box>

      {transcribe ? (
        <TranscribeDialog
          open={transcribe.open}
          source="photo"
          stage={transcribe.stage}
          step={transcribe.step}
          progress={transcribe.progress}
          text={transcribe.text}
          onTextChange={(text) => setTranscribe((t) => ({ ...t, text }))}
          error={transcribe.error}
          model={transcribe.model}
          pages={transcribe.pages}
          saving={transcribe.saving}
          discardLabel="Back to pages"
          onClose={backToPages}
          onRetry={readPages}
          onCompose={composeIt}
          onKeepPlain={keepPlain}
        />
      ) : null}

      {compose ? (
        // New notes only: there is nothing here to replace.
        <ComposeDialog
          open={compose.open}
          loading={compose.loading}
          markdown={compose.markdown}
          stats={compose.stats}
          error={compose.error}
          model={compose.model}
          discardLabel="Back to transcript"
          onClose={() => {
            setCompose(null);
            setTranscribe((t) => (t ? { ...t, open: true } : t));
          }}
          onSaveAsNew={() => saveResult(compose.markdown, { composed: true })}
        />
      ) : null}
    </Box>
  );
}
