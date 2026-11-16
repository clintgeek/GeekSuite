import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Button, Card, CircularProgress, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { RestoreFromTrash as RestoreIcon, DeleteForever as DeleteForeverIcon, ArrowBack as BackIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { GeekEmptyState, GeekLoadError, useToast } from '@geeksuite/ui';
import api from '../api';
import CodexDialog from '../components/primitives/CodexDialog';
import D20 from '../components/primitives/D20';
import { fonts } from '../theme/theme';

const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Whole days until `purgeAt`, never below 0. */
const daysLeft = (purgeAt) => Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86400000));

/**
 * Recently deleted (SUITE_REVIEW_2026-11 decision S-D5, 2026-11-16).
 *
 * A deleted tale waits here for 30 days with Restore and Delete forever,
 * then the server's lazy purge removes it (opening this page runs that purge
 * — see backend storyTrashService). Delete forever asks once more, because it
 * is the one action here that cannot be undone.
 */
export default function RecentlyDeleted() {
  const theme = useTheme();
  const c = theme.palette.candle;
  const { notify } = useToast();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toPurge, setToPurge] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await api.get('/stories/deleted');
      setStories(Array.isArray(res.data?.stories) ? res.data.stories : []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (story) => {
    setBusyId(story._id);
    try {
      await api.post(`/stories/${story._id}/restore`);
      setStories((prev) => prev.filter((s) => s._id !== story._id));
      notify(`"${story.title}" is back on the table.`, { tone: 'success' });
    } catch (err) {
      notify(err.message || 'Could not restore the tale', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (story) => {
    setBusyId(story._id);
    try {
      await api.delete(`/stories/${story._id}/forever`);
      setStories((prev) => prev.filter((s) => s._id !== story._id));
      setToPurge(null);
      notify(`"${story.title}" is gone for good.`, { tone: 'info' });
    } catch (err) {
      notify(err.message || 'Could not delete the tale', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const label = {
    fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: c.accentLabel,
  };

  return (
    <Box>
      <Box sx={{ mb: { xs: 5, md: 6 }, mt: 2 }}>
        <Button component={RouterLink} to="/" startIcon={<BackIcon />} sx={{ minHeight: 44, ml: -1, mb: 2, color: 'text.secondary' }}>
          Your Tales
        </Button>
        <Typography component="p" sx={label}>Kept for 30 days</Typography>
        <Typography variant="h2" component="h1" sx={{ mt: 1, fontSize: { xs: '1.6rem', md: '2rem' } }}>
          Recently deleted
        </Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic', maxWidth: 560 }}>
          A deleted tale waits here for 30 days. Restore puts it back on the table; after 30 days it is removed for good.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress aria-label="Loading recently deleted tales" />
        </Box>
      ) : loadError ? (
        <GeekLoadError what="recently deleted tales" error={loadError} onRetry={load} />
      ) : stories.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: { xs: 10, md: 12 }, px: 4, borderRadius: '8px', border: `2px dashed ${c.rule}`, bgcolor: alpha(c.paper, 0.6) }}>
          <GeekEmptyState
            icon={<D20 size={56} value={1} color={c.accentLabel} strokeWidth={0.9} sx={{ mx: 'auto' }} />}
            title="Nothing in the bin"
            titleSx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.25rem' }}
            description="Tales you delete wait here for 30 days."
            descriptionSx={{ color: 'text.secondary' }}
          />
        </Box>
      ) : (
        <Box component="ul" aria-label="Recently deleted tales" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 3 }}>
          {stories.map((story) => {
            const left = daysLeft(story.purgeAt);
            return (
              <Card component="li" key={story._id} sx={{ bgcolor: c.paper, p: { xs: 4, md: 5 } }}>
                <Typography variant="h4" component="h2" sx={{ fontSize: '1.2rem', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                  {story.title}
                </Typography>
                <Typography sx={{ mt: 1, fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary', fontVariantNumeric: 'lining-nums' }}>
                  {[story.genre, `Deleted ${formatDate(story.deletedAt)}`].filter(Boolean).join(' · ')}
                </Typography>
                <Typography sx={{ mt: 0.5, fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary', fontVariantNumeric: 'lining-nums' }}>
                  {left === 0 ? 'Removed for good today' : `Removed for good in ${left} ${left === 1 ? 'day' : 'days'} (${formatDate(story.purgeAt)})`}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 3 }}>
                  <Button
                    variant="contained" startIcon={<RestoreIcon />}
                    onClick={() => restore(story)} disabled={busyId === story._id}
                    aria-label={`Restore ${story.title}`}
                    sx={{ minHeight: 44, px: 3 }}
                  >
                    Restore
                  </Button>
                  <Button
                    startIcon={<DeleteForeverIcon />}
                    onClick={() => setToPurge(story)} disabled={busyId === story._id}
                    aria-label={`Delete ${story.title} forever`}
                    sx={{ minHeight: 44, px: 2, color: c.tone.bad }}
                  >
                    Delete forever
                  </Button>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      <CodexDialog
        open={!!toPurge}
        onClose={() => setToPurge(null)}
        title="Delete forever?"
        mode="window"
        maxWidth="xs"
        primaryAction={
          <Button onClick={() => purge(toPurge)} variant="contained" color="error" disabled={!!busyId}>
            {busyId ? 'Deleting…' : 'Delete forever'}
          </Button>
        }
        secondaryAction={<Button onClick={() => setToPurge(null)} sx={{ color: 'text.secondary' }}>Keep it</Button>}
      >
        <Typography variant="body1" sx={{ mb: 1 }}>
          "{toPurge?.title}" will be removed for good.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Its transcript, characters and checkpoints cannot be brought back after this.
        </Typography>
      </CodexDialog>
    </Box>
  );
}
