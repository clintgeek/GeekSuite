import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ContentCopy from '@mui/icons-material/ContentCopy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApolloClient, useMutation } from '@apollo/client';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { FOLD_IN_APPLY, FOLD_IN_PREVIEW, RESTORE_NOTE_VERSION, UPDATE_NOTE } from '../../graphql/mutations';
import { GET_NOTE_BY_ID } from '../../graphql/queries';
import { onNoteUpdated } from '../../graphql/cacheUpdates';
import { MARKDOWN_COMPONENTS, markdownOverflowSx } from '../notes/markdownComponents';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';
import { MONO } from '../../theme/graphite';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { applyInlineTags } from '../../utils/inlineTags';
import {
  FOLD_IN_INPUT_MAX,
  droppedLine,
  failedPreviewMessage,
  foldInErrorMessage,
  opPreviewMarkdown,
  opVerb,
  previewSegments,
  toOperationInput,
} from '../../utils/foldIn';

/**
 * FoldInSheet — "put this new information into that note" (DOCS/CONTEXT.md §13).
 *
 * Three steps, and nothing is written until the last one:
 *
 *   1. the new info — typed, pasted, or handed over by the share target;
 *   2. "Propose changes" — the gateway asks the model for ANCHORED edits and
 *      checks every one against the note. What comes back is a list of
 *      cards in note order: where each change lands, what it adds (rendered,
 *      on a pass of highlighter), and for a correction the old text struck
 *      through beside the new. Each card can be turned off;
 *   3. "Apply N changes" — the gateway re-checks the accepted ones, keeps a
 *      version, applies them, and the toast's Undo restores that version.
 *
 * The model never writes the note, so this sheet never shows a rewritten
 * note to accept or reject wholesale — only small changes, each in its place.
 * Anything the model could not place, and the content of any suggestion that
 * did not match the note, is in its own card with a Copy button: it is never
 * silently dropped.
 *
 * Phone: a full-height sheet whose bottom edge rides above the keyboard
 * (useKeyboardInset — Chrome on Android shrinks only the visual viewport, so a
 * `bottom: 0` sheet would hide its own actions behind the keyboard). Desktop:
 * a dialog.
 */
export default function FoldInSheet({
  open,
  onClose,
  note,
  initialInput = '',
  // Runs before the proposal is asked for — the editor flushes its pending
  // save here, so the gateway sees what is on screen. Throw to stop.
  prepare,
  onApplied,
  onUndone,
}) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const keyboardInset = useKeyboardInset();
  const client = useApolloClient();
  const { notify } = useToast();
  const [previewMutation] = useMutation(FOLD_IN_PREVIEW);
  const [applyMutation] = useMutation(FOLD_IN_APPLY, { update: onNoteUpdated });

  const [input, setInput] = useState(initialInput);
  const [stage, setStage] = useState('input'); // input | proposing | proposal
  const [proposal, setProposal] = useState(null);
  const [accepted, setAccepted] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [whole, setWhole] = useState(false);
  const [base, setBase] = useState(null);
  const runRef = useRef(0);

  // A share hands its text over after the sheet mounts.
  useEffect(() => { if (open) setInput((cur) => cur || initialInput); }, [open, initialInput]);

  useEffect(() => {
    if (stage !== 'proposing') return undefined;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const ops = proposal?.operations || [];
  const chosen = ops.filter((op) => accepted.has(op.id));
  const tooLong = input.length > FOLD_IN_INPUT_MAX;
  const failed = Boolean(proposal?.stats?.failed);
  const droppedCount = proposal?.stats?.dropped?.length || 0;

  const close = () => {
    runRef.current += 1; // a proposal still in flight is now stale
    onClose?.();
  };

  const propose = async () => {
    if (!input.trim() || tooLong || !note?.id) return;
    const run = ++runRef.current;
    setError(null);
    setApplyError(null);
    setWhole(false);
    setStage('proposing');
    try {
      await prepare?.();
      const { data } = await previewMutation({ variables: { noteId: note.id, input } });
      if (run !== runRef.current) return;
      const result = data?.foldInPreview;
      if (!result) throw new Error('The server returned nothing.');
      setProposal(result);
      setAccepted(new Set(result.operations.map((op) => op.id)));
      setStage('proposal');
      if (result.stats?.failed) setError(failedPreviewMessage(result.provenance));
      // The whole-note preview needs the exact text the proposal was made
      // against. Only shown when the stored note still is that text.
      setBase(null);
      if (result.operations.length) {
        try {
          const { data: fresh } = await client.query({ query: GET_NOTE_BY_ID, variables: { id: note.id }, fetchPolicy: 'network-only' });
          const n = fresh?.note;
          if (run === runRef.current && n && new Date(n.updatedAt).getTime() === new Date(result.baseUpdatedAt).getTime()) {
            setBase(n.content || '');
          }
        } catch { /* the cards are enough */ }
      }
    } catch (err) {
      if (run !== runRef.current) return;
      setError(foldInErrorMessage(err));
      setStage('input');
    }
  };

  const undo = async (versionId) => {
    try {
      const { data } = await client.mutate({ mutation: RESTORE_NOTE_VERSION, variables: { versionId }, update: onNoteUpdated });
      onUndone?.(data?.restoreNoteVersion);
      notify('Undone. The note is back as it was.', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not undo. The earlier version is in Version history.', { tone: 'error' });
    }
  };

  const apply = async () => {
    if (!chosen.length || applying || !proposal) return;
    setApplying(true);
    setApplyError(null);
    try {
      const { data } = await applyMutation({
        variables: {
          noteId: note.id,
          baseUpdatedAt: String(proposal.baseUpdatedAt),
          operations: chosen.map(toOperationInput),
        },
      });
      const res = data?.foldInApply;
      if (!res?.note) throw new Error('The server returned nothing.');
      let saved = res.note;
      // Inline #tags join the chips, as on any save (utils/inlineTags.js).
      const inline = applyInlineTags({ tags: saved.tags || [], content: saved.content, type: saved.type });
      if (inline.changed) {
        try {
          const { data: tagged } = await client.mutate({ mutation: UPDATE_NOTE, variables: { id: saved.id, tags: inline.tags }, update: onNoteUpdated });
          if (tagged?.updateNote) saved = tagged.updateNote;
        } catch { /* the fold-in landed; the chips catch up on the next save */ }
      }
      onApplied?.({ note: saved, versionId: res.versionId, applied: res.applied });
      notify(`Folded in ${res.applied} change${res.applied === 1 ? '' : 's'}.`, {
        tone: 'success',
        duration: 10000,
        action: (
          <Button color="inherit" size="small" onClick={() => undo(res.versionId)} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44 }}>
            Undo
          </Button>
        ),
      });
      close();
    } catch (err) {
      setApplyError({
        message: foldInErrorMessage(err, { applying: true }),
        conflict: err?.graphQLErrors?.[0]?.extensions?.code === 'CONFLICT',
      });
    } finally {
      setApplying(false);
    }
  };

  const toggle = (id) => setAccepted((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const segments = useMemo(
    () => (whole && base !== null ? previewSegments(base, chosen) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chosen derives from these
    [whole, base, proposal, accepted],
  );

  const insSx = { bgcolor: g.hlSoft, color: g.ink, textDecoration: 'none', borderRadius: '2px', boxShadow: `inset 3px 0 0 ${g.hl}` };
  const delSx = { color: g.ink2, textDecorationLine: 'line-through', textDecorationThickness: '1.5px' };

  const actions = stage === 'proposal'
    ? [
      <Button key="back" onClick={() => { setStage('input'); setApplyError(null); }} disabled={applying} sx={{ textTransform: 'none', ...tapTarget44 }}>
        Back
      </Button>,
      failed || !ops.length ? (
        <Button key="again" variant="contained" onClick={propose} sx={{ textTransform: 'none', ...tapTarget44 }}>
          Try again
        </Button>
      ) : (
        <Button
          key="apply"
          variant="contained"
          onClick={apply}
          disabled={!chosen.length || applying}
          startIcon={applying ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ textTransform: 'none', ...tapTarget44 }}
        >
          {applying ? 'Applying…' : `Apply ${chosen.length} change${chosen.length === 1 ? '' : 's'}`}
        </Button>
      ),
    ]
    : [
      <Button key="cancel" onClick={close} sx={{ textTransform: 'none', ...tapTarget44 }}>
        Cancel
      </Button>,
      <Button
        key="propose"
        variant="contained"
        onClick={propose}
        disabled={!input.trim() || tooLong || stage === 'proposing'}
        startIcon={stage === 'proposing' ? <CircularProgress size={16} color="inherit" /> : null}
        sx={{ textTransform: 'none', ...tapTarget44 }}
      >
        {stage === 'proposing' ? 'Proposing…' : 'Propose changes'}
      </Button>,
    ];

  // Phone: lift the sheet's bottom edge (and its actions) above the keyboard.
  const keyboardSx = isPhone && keyboardInset
    ? {
      bottom: `${keyboardInset}px`,
      height: `calc(100vh - ${keyboardInset}px)`,
      '@supports (height: 100dvh)': { height: `calc(100dvh - ${keyboardInset}px)` },
    }
    : undefined;

  return (
    <GeekSheet
      open={open}
      onClose={close}
      title="Fold in new info"
      description={note?.title ? `Into “${note.title}”` : undefined}
      snap="full"
      maxWidth="md"
      initialFocus={stage === 'input' ? 'textarea' : undefined}
      actions={actions}
      actionsAlign="end"
      sx={keyboardSx}
    >
      <Box data-foldin-stage={stage} sx={{ pb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {stage !== 'proposal' ? (
          <>
            <TextField
              label="New info"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={stage === 'proposing'}
              multiline
              minRows={isPhone ? 6 : 8}
              maxRows={isPhone ? 12 : 18}
              fullWidth
              placeholder="Paste or type what you found — a new spider, a correction, a link."
              error={tooLong}
              helperText={tooLong
                ? `That's ${input.length.toLocaleString()} characters; Fold-in takes up to ${FOLD_IN_INPUT_MAX.toLocaleString()}. For more, use Compose.`
                : 'The note changes only when you apply. You will see every change first.'}
              // Room for the outlined label, which sits above the box and
              // was clipped by the sheet body's scroller at mt: 1.
              sx={{ mt: 3 }}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
            {stage === 'proposing' ? (
              <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress size={18} />
                <Box>
                  <Typography variant="body2">
                    Reading the note and proposing where this goes{elapsed ? ` · ${elapsed} s` : '…'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Usually under ten seconds. Each suggestion is checked against the note before you see it.
                  </Typography>
                </Box>
              </Box>
            ) : null}
          </>
        ) : (
          <>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {applyError ? (
              <Alert
                severity="error"
                action={applyError.conflict ? (
                  <Button color="inherit" size="small" onClick={propose} sx={{ textTransform: 'none', minHeight: 44 }}>Propose again</Button>
                ) : null}
              >
                {applyError.message}
              </Alert>
            ) : null}
            {!failed && proposal?.summary ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{proposal.summary}</Typography>
            ) : null}
            {droppedCount ? (
              <Alert severity="info" variant="outlined" data-foldin-dropped={droppedCount}>
                {droppedLine(droppedCount)}
                {proposal.unplaced?.length ? ' What they carried is under “Couldn’t find a place”.' : ''}
              </Alert>
            ) : null}
            {proposal?.stats?.truncated ? (
              <Alert severity="warning">The model ran out of room before it finished, so some of your text may be under “Couldn’t find a place”, or missing. Check below.</Alert>
            ) : null}
            {!failed && !ops.length ? (
              <Typography variant="body2" sx={{ py: 2 }}>
                No changes to suggest — the note may already say this. Nothing was changed.
              </Typography>
            ) : null}

            {ops.length && base !== null ? (
              <FormControlLabel
                control={<Switch checked={whole} onChange={(e) => setWhole(e.target.checked)} />}
                label="Preview the whole note"
                sx={{ alignSelf: 'flex-start', ml: 0, minHeight: 44, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            ) : null}

            {segments ? (
              <Box
                role="region"
                aria-label="The whole note with the changes"
                data-foldin-whole
                sx={{
                  fontFamily: MONO,
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  bgcolor: g.sheet,
                  color: g.ink,
                  border: `1px solid ${g.rule}`,
                  borderRadius: '4px',
                  p: 1.5,
                  m: 0,
                  '& ins': { px: '3px' },
                  '& del + ins': { ml: '6px' },
                }}
              >
                {segments.map((s, i) => {
                  if (s.kind === 'ins') return <Box key={i} component="ins" sx={insSx}>{s.text}</Box>;
                  if (s.kind === 'del') return <Box key={i} component="del" sx={delSx}>{s.text}</Box>;
                  return <span key={i}>{s.text}</span>;
                })}
              </Box>
            ) : (
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Proposed changes">
                {ops.map((op) => (
                  <ChangeCard
                    key={op.id}
                    op={op}
                    included={accepted.has(op.id)}
                    onToggle={() => toggle(op.id)}
                    insSx={insSx}
                    delSx={delSx}
                    g={g}
                  />
                ))}
              </Stack>
            )}

            {proposal?.unplaced?.length ? (
              <UnplacedCard items={proposal.unplaced} g={g} notify={notify} />
            ) : null}

            {proposal?.provenance?.model ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO }}>
                {proposal.provenance.model}
              </Typography>
            ) : null}
          </>
        )}
      </Box>
    </GeekSheet>
  );
}

function ChangeCard({ op, included, onToggle, insSx, delSx, g }) {
  const labelId = `foldin-${op.id}-where`;
  return (
    <Box
      component="li"
      data-foldin-card={op.type}
      data-included={included ? 'true' : 'false'}
      sx={{
        border: `1px solid ${included ? g.border : g.rule}`,
        borderRadius: '6px',
        bgcolor: g.sheet,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 1.5, pt: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, pt: '10px' }}>
          <Typography id={labelId} variant="subtitle2" sx={{ fontWeight: 600, color: g.ink, overflowWrap: 'anywhere' }}>
            {op.location}
          </Typography>
          <Typography variant="caption" sx={{ color: g.ink2, display: 'block' }}>
            {opVerb(op)}{op.why ? ` · ${op.why}` : ''}
          </Typography>
        </Box>
        <Checkbox
          checked={included}
          onChange={onToggle}
          inputProps={{ 'aria-label': `Include: ${op.location}` }}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        />
      </Box>
      <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
        {included ? null : (
          <Typography variant="caption" sx={{ color: g.ink2, display: 'block', mb: 0.5 }}>Left out — this change won’t be applied.</Typography>
        )}
        {op.type === 'replace_text' ? (
          <Box sx={{ fontSize: '0.875rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <Box component="del" sx={{ ...delSx, display: 'block', mb: 0.5 }}>{op.find}</Box>
            {op.replace ? (
              <Box component="ins" sx={{ ...(included ? insSx : { color: g.ink }), display: 'block', px: 1, py: 0.5 }}>{op.replace}</Box>
            ) : (
              <Typography variant="caption" sx={{ color: g.ink2 }}>Removed, nothing in its place.</Typography>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              ...markdownOverflowSx,
              ...(included ? insSx : { color: g.ink, boxShadow: `inset 3px 0 0 ${g.rule}` }),
              px: 1.5,
              py: 0.75,
              fontSize: '0.875rem',
              '& > :first-of-type': { mt: 0 },
              '& > :last-child': { mb: 0 },
              '& p': { my: 0.75, lineHeight: 1.55 },
              '& h1, & h2, & h3, & h4': { fontSize: '1rem', fontWeight: 600, my: 0.75 },
              '& ul, & ol': { pl: 4, my: 0.5 },
              '& table': { borderCollapse: 'collapse', my: 0.5 },
              '& th, & td': { border: `1px solid ${g.rule}`, px: 1, py: 0.5, textAlign: 'left' },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{opPreviewMarkdown(op)}</ReactMarkdown>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function UnplacedCard({ items, g, notify }) {
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied.', { tone: 'success' });
    } catch {
      notify('Could not copy — select the text instead.', { tone: 'error' });
    }
  };
  return (
    <Box data-foldin-unplaced sx={{ border: `1px dashed ${g.border}`, borderRadius: '6px', px: 1.5, py: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: g.ink }}>Couldn’t find a place for:</Typography>
      <Typography variant="caption" sx={{ color: g.ink2, display: 'block', mb: 0.5 }}>
        Not added. Copy it into the note yourself if it belongs.
      </Typography>
      <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {items.map((text, i) => (
          <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, pt: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: g.ink }}>
              {text}
            </Typography>
            <IconButton aria-label={`Copy: ${text.slice(0, 40)}`} onClick={() => copy(text)} sx={{ ...tapTarget44, flexShrink: 0 }}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
