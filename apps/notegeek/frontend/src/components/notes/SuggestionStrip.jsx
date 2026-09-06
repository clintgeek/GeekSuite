import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/InsertLink';
import TagIcon from '@mui/icons-material/LocalOfferOutlined';
import { useLazyQuery } from '@apollo/client';
import { GeekChip } from '@geeksuite/ui';
import { SUGGEST_FOR_NOTE } from '../../graphql/queries';
import { supportsLinkInsertion } from '../../utils/noteLinks';
import { excerptFor, readDismissed, writeDismissed } from '../../utils/suggestions';

/**
 * SuggestionStrip — "you already have a note about this" (DOCS/AI_IDEAS.md #3).
 *
 * A quiet row under the title: tags the writer already uses that fit what they
 * are writing, and notes of their own that relate to it. One tap applies a tag
 * or drops a link in the body. **Nothing is ever applied on its own** — the
 * strip only ever proposes, and the ordinary save path does the writing.
 *
 * ## What it costs
 *
 * The query runs on save, and once 1.5 s after the writer stops typing in the
 * TITLE — not the body, which changes on every keystroke and would turn a
 * suggestion into a rate limit. The gateway's ranking is local and free; the
 * optional model re-rank of the related half is capped at 30 calls a day, and
 * only happens at all when the writer has switched the feature on.
 *
 * ## Dismissal
 *
 * Per note, in `sessionStorage`: a strip waved away stays away for the rest of
 * the tab's life, and comes back tomorrow. `localStorage` would be a promise
 * this feature has not earned; a store on the server would be a write we said
 * we would not make.
 *
 * ## The provenance line
 *
 * Shown only when a model was actually consulted, because that is the only
 * case where the writer is owed the disclosure. The local ranking says nothing
 * — a strip that announces "computed locally" on every save is noise.
 */

const TITLE_DEBOUNCE_MS = 1500;

/** Chips are 44px tall on every viewport (MOBILE_UI_PLAN §2) and wrap; the row never scrolls sideways. */
const chipSx = (theme, tone) => ({
  minHeight: 44,
  borderRadius: '22px',
  maxWidth: '100%',
  borderColor: alpha(tone, 0.35),
  color: 'text.primary',
  bgcolor: alpha(tone, 0.06),
  '& .MuiChip-label': {
    fontSize: '0.8125rem',
    px: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& .MuiChip-icon': { color: tone, ml: 1 },
  '&:hover': { bgcolor: alpha(tone, 0.12) },
  '&:focus-visible': { outline: `2px solid ${ tone }`, outlineOffset: 2 },
});

function SuggestionStrip({
  enabled = false,
  noteId = null,
  title = '',
  content = '',
  noteType = 'text',
  tags = [],
  /** Increment to ask for a fresh set — NoteEditorPage bumps it on every save. */
  saveToken = 0,
  onApplyTag,
  onInsertLink,
}) {
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(() => readDismissed(noteId));
  const [runSuggest, { data }] = useLazyQuery(SUGGEST_FOR_NOTE, {
    fetchPolicy: 'no-cache',
    // A suggestion that fails is a strip that does not appear. It is never
    // worth a toast: the writer did not ask for it.
    onError: () => {},
  });

  // Dismissal is per note, so a new note starts clean.
  useEffect(() => {
    setDismissed(readDismissed(noteId));
  }, [noteId]);

  // The latest inputs, without making the fetch effects depend on every
  // keystroke — the body in particular changes constantly and must not itself
  // trigger a request.
  const latest = useRef({ title, content, noteType, tags, noteId });
  latest.current = { title, content, noteType, tags, noteId };

  // The last question we asked. Autosave fires every couple of seconds while
  // someone is writing, and asking the same question again is a round trip and
  // (once the model half is on) a call off the daily allowance for an answer
  // we already have on screen.
  const lastAsked = useRef(null);

  const fetchSuggestions = useCallback(() => {
    const now = latest.current;
    const excerpt = excerptFor(now.content, now.noteType);
    if (!now.title.trim() && !excerpt.trim()) return;
    const variables = {
      noteId: now.noteId || null,
      title: now.title || '',
      excerpt,
      tags: now.tags || [],
    };
    const asked = JSON.stringify(variables);
    if (asked === lastAsked.current) return;
    lastAsked.current = asked;
    runSuggest({ variables });
  }, [runSuggest]);

  // On save.
  useEffect(() => {
    if (!enabled || dismissed || !saveToken) return;
    fetchSuggestions();
  }, [enabled, dismissed, saveToken, fetchSuggestions]);

  // …and when the writer pauses on the title. Cheap: one query, and the title
  // is the strongest signal the ranking has.
  useEffect(() => {
    if (!enabled || dismissed || !title.trim()) return undefined;
    const timer = setTimeout(fetchSuggestions, TITLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, dismissed, title, fetchSuggestions]);

  const suggestions = data?.suggestForNote;
  const canLink = supportsLinkInsertion(noteType);

  const relatedRows = useMemo(
    () => (canLink ? suggestions?.related ?? [] : []),
    [canLink, suggestions]
  );
  const tagRows = suggestions?.tags ?? [];

  const handleDismiss = () => {
    writeDismissed(noteId);
    setDismissed(true);
  };

  if (!enabled || dismissed) return null;
  if (!tagRows.length && !relatedRows.length) return null;

  const provenance = suggestions?.provenance;
  const modelLine =
    provenance?.source === 'model' && provenance?.model
      ? `related notes ranked by ${ provenance.model }`
      : null;

  return (
    <Box
      component="section"
      aria-label="Suggested tags and related notes"
      sx={{
        mt: 1,
        px: 1.25,
        py: 1,
        borderRadius: 2,
        border: `1px solid ${ theme.palette.divider }`,
        bgcolor: alpha(theme.palette.primary.main, 0.03),
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" flexWrap="wrap" sx={{ gap: 1 }}>
            {tagRows.map((row) => (
              <GeekChip
                key={`tag-${ row.tag }`}
                icon={<TagIcon sx={{ fontSize: 16 }} />}
                label={row.tag}
                clickable
                // Keep the caret where it was: the body's textarea keeps focus
                // and its selection, so a link chip tapped next lands there.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onApplyTag?.(row.tag)}
                sx={chipSx(theme, theme.palette.primary.main)}
              />
            ))}
            {relatedRows.map((row) => (
              <GeekChip
                key={`note-${ row.id }`}
                icon={<LinkIcon sx={{ fontSize: 16 }} />}
                label={row.title}
                title={row.why || undefined}
                clickable
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertLink?.(row)}
                sx={chipSx(theme, theme.palette.secondary?.main || theme.palette.primary.main)}
              />
            ))}
          </Stack>

          {modelLine && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              {modelLine}
            </Typography>
          )}
        </Box>

        <Box
          component="button"
          type="button"
          aria-label="Dismiss suggestions"
          onClick={handleDismiss}
          sx={{
            flexShrink: 0,
            width: 44,
            height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '50%',
            bgcolor: 'transparent',
            color: 'text.secondary',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': { outline: `2px solid ${ theme.palette.primary.main }`, outlineOffset: 2 },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </Box>
      </Stack>
    </Box>
  );
}

export default SuggestionStrip;
