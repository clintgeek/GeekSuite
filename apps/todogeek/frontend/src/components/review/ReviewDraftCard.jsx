import { useCallback, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { Sparkles, Plus, Check, RefreshCw } from 'lucide-react';
import { colors } from '../../theme/colors';
import { provenanceLine } from '../../utils/provenanceLine';

/**
 * ReviewDraftCard — the weekly review, pre-drafted (DOCS/AI_IDEAS.md #1).
 *
 * Three rules from the suite's AI contract are visible in this file, and all
 * three are the point of it:
 *
 *   1. **It never writes.** "Use as review" opens the ordinary review editor
 *      with the summary in it; "Add as task" calls the ordinary `createTask`
 *      mutation. Nothing here saves anything on its own.
 *   2. **It says where it came from.** The chip and the provenance line are
 *      not decoration — a deterministic summary is labelled as one, and a
 *      model-written one names the model. There is no state of this card in
 *      which the reader cannot tell which they are looking at.
 *   3. **It is a button, not a page load.** The query is lazy. Opening
 *      `/review` costs nothing; asking for a draft is a deliberate act.
 *
 * Mobile: every control is a 44px target, nothing is under 12px, and the
 * carry-forward rows wrap rather than scroll sideways.
 */

const MIN_TAP = 44;

const ReviewDraftCard = ({
  weekLabel,
  loading = false,
  error = null,
  result = null,
  onDraft,
  onUseAsReview,
  onAddTask,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const captionInk = theme.palette.text.muted;
  const mutedInk = theme.palette.text.secondary;
  const hairline = isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200];

  const [added, setAdded] = useState({});
  const [adding, setAdding] = useState(null);

  const draft = result?.draft ?? null;
  const provenance = result?.provenance ?? null;
  const facts = result?.facts ?? null;
  const fromModel = provenance?.source === 'model';

  const handleAdd = useCallback(
    async (title) => {
      if (!onAddTask || added[title]) return;
      setAdding(title);
      try {
        await onAddTask(title);
        setAdded((prev) => ({ ...prev, [title]: true }));
      } finally {
        setAdding(null);
      }
    },
    [onAddTask, added]
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: hairline,
        backgroundColor: 'background.paper',
        p: { xs: 2, sm: 2.5 },
        mb: 3,
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="flex-start"
        justifyContent="space-between"
        sx={{ flexWrap: 'wrap', rowGap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              color: captionInk,
              lineHeight: 1.2,
            }}
          >
            {weekLabel ? `Week of ${weekLabel}` : 'This week'}
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '1.125rem', sm: '1.25rem' },
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'text.primary',
            }}
          >
            Review draft
          </Typography>
        </Box>
        {draft && (
          <Chip
            size="small"
            icon={<Sparkles size={13} strokeWidth={2} aria-hidden="true" />}
            label={fromModel ? 'AI-drafted' : 'No model'}
            sx={{
              fontSize: '0.75rem',
              height: 26,
              borderRadius: 1.5,
              '& .MuiChip-icon': { ml: 0.75 },
            }}
          />
        )}
      </Stack>

      {!draft && !loading && (
        <>
          <Typography variant="body2" sx={{ color: mutedInk, mt: 1.5, fontSize: '0.875rem' }}>
            Your week&rsquo;s counts, streaks and open tasks, written up as a starting point.
            Nothing is saved until you say so.
          </Typography>
          <Button
            variant="outlined"
            onClick={onDraft}
            startIcon={<Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />}
            sx={{ mt: 2, minHeight: MIN_TAP, fontSize: '0.875rem' }}
          >
            Draft my review
          </Button>
        </>
      )}

      {loading && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2, minHeight: MIN_TAP }}>
          <CircularProgress size={18} />
          <Typography variant="body2" sx={{ color: mutedInk, fontSize: '0.875rem' }}>
            Reading your week&hellip;
          </Typography>
        </Stack>
      )}

      {error && !loading && (
        <Typography
          role="alert"
          variant="body2"
          sx={{ mt: 2, color: 'error.main', fontSize: '0.875rem' }}
        >
          The draft could not be built. {error}
        </Typography>
      )}

      {draft && !loading && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="body1"
            sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.65 }}
          >
            {draft.summary}
          </Typography>

          {draft.wins?.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography
                component="h3"
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary',
                  mb: 0.75,
                }}
              >
                What went well
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {draft.wins.map((win) => (
                  <Typography
                    component="li"
                    key={win}
                    variant="body2"
                    sx={{ color: mutedInk, fontSize: '0.875rem', lineHeight: 1.6 }}
                  >
                    {win}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}

          {draft.carryForward?.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography
                component="h3"
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary',
                  mb: 0.75,
                }}
              >
                Carry forward
              </Typography>
              <Stack spacing={1}>
                {draft.carryForward.map((row) => (
                  <Stack
                    key={row.title}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ flexWrap: 'wrap', rowGap: 1 }}
                  >
                    <Box sx={{ minWidth: 0, flex: '1 1 12rem' }}>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.primary', fontSize: '0.875rem', fontWeight: 500 }}
                      >
                        {row.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: captionInk, fontSize: '0.75rem' }}>
                        {row.reason}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="text"
                      disabled={Boolean(added[row.title]) || adding === row.title}
                      onClick={() => handleAdd(row.title)}
                      startIcon={
                        added[row.title]
                          ? <Check size={15} strokeWidth={2} aria-hidden="true" />
                          : <Plus size={15} strokeWidth={2} aria-hidden="true" />
                      }
                      sx={{ minHeight: MIN_TAP, fontSize: '0.8125rem', flexShrink: 0 }}
                    >
                      {added[row.title] ? 'Added' : 'Add as task'}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {draft.suggestedFocus && (
            <Typography
              variant="body2"
              sx={{
                mt: 2,
                pl: 1.5,
                borderLeft: `2px solid ${colors.primary[500]}`,
                color: mutedInk,
                fontStyle: 'italic',
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                lineHeight: 1.6,
              }}
            >
              {draft.suggestedFocus}
            </Typography>
          )}

          <Divider sx={{ my: 2, borderColor: hairline, borderStyle: 'dotted' }} />

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexWrap: 'wrap', rowGap: 1 }}
          >
            <Button
              variant="contained"
              disableElevation
              onClick={() => onUseAsReview?.(draft, facts)}
              sx={{ minHeight: MIN_TAP, fontSize: '0.875rem' }}
            >
              Use as review
            </Button>
            <Button
              variant="text"
              onClick={onDraft}
              startIcon={<RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
              sx={{ minHeight: MIN_TAP, fontSize: '0.8125rem', color: mutedInk }}
            >
              Draft again
            </Button>
          </Stack>

          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1.5, color: captionInk, fontSize: '0.75rem', lineHeight: 1.5 }}
          >
            {provenanceLine(provenance)}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default ReviewDraftCard;
