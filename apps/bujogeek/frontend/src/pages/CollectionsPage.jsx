import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import { Plus, Archive, ArchiveRestore, ChevronRight } from 'lucide-react';
import BujoDialog from '../components/primitives/BujoDialog';
import useCollections from '../hooks/useCollections';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import EmptyState from '../components/shared/EmptyState';
import { colors } from '../theme/colors';
import { useToast } from '@geeksuite/ui';

/**
 * CollectionsPage — the index of the user's collections.
 *
 * A collection is a named list of entries that lives outside the daily log
 * ("Books to Read", "Project X"). Entries only join the log once dated, so this
 * page is deliberately quiet: names, progress, and a way in.
 */
const FORM_ID = 'bujo-new-collection-form';
const CollectionsPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { notify } = useToast();
  const {
    active,
    archived,
    loading,
    createCollection,
    updateCollection,
  } = useCollections();

  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  useGlobalShortcuts();

  const totals = useMemo(() => {
    const entries = active.reduce((sum, c) => sum + (c.taskCount || 0), 0);
    return { lists: active.length, entries };
  }, [active]);

  const handleCreate = async (event) => {
    event?.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await createCollection(name, form.description.trim());
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      if (created?.id) navigate(`/collections/${created.id}`);
    } catch {
      notify('Failed to create collection', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (collection, event) => {
    event.stopPropagation();
    try {
      await updateCollection(collection.id, { archived: !collection.archived });
      notify(collection.archived ? 'Collection restored' : 'Collection archived', { tone: 'success' });
    } catch {
      notify('Failed to update collection', { tone: 'error' });
    }
  };

  const captionInk = isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  const renderCard = (collection) => {
    const total = collection.taskCount || 0;
    const done = collection.completedCount || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <Box
        key={collection.id}
        onClick={() => navigate(`/collections/${collection.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/collections/${collection.id}`);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: { xs: 1.75, sm: 2.25 },
          py: 1.75,
          cursor: 'pointer',
          opacity: collection.archived ? 0.62 : 1,
          borderBottom: dottedRule,
          transition: 'background-color 0.14s ease',
          '&:last-of-type': { borderBottom: 'none' },
          '&:hover': {
            backgroundColor: isDark ? 'rgba(255,245,220,0.03)' : `${colors.ink[100]}55`,
          },
          '&:hover .collection-chevron': { opacity: 1, transform: 'translateX(2px)' },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '1rem', sm: '1.0625rem' },
              fontWeight: 500,
              color: theme.palette.text.primary,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
            }}
          >
            {collection.name}
          </Typography>

          {collection.description && (
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontStyle: 'italic',
                fontFamily: '"Fraunces", serif',
                color: mutedInk,
                mt: 0.375,
                lineHeight: 1.45,
              }}
            >
              {collection.description}
            </Typography>
          )}

          {/* Progress: done / total, with a hairline meter */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.875 }}>
            <Box
              sx={{
                width: 84,
                height: 2,
                borderRadius: 1,
                backgroundColor: isDark ? 'rgba(255,245,220,0.1)' : colors.ink[100],
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: colors.primary[400],
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
            <Typography
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: captionInk,
              }}
            >
              {done}/{total} done
            </Typography>
          </Box>
        </Box>

        <Tooltip title={collection.archived ? 'Restore' : 'Archive'} placement="top">
          <IconButton
            size="small"
            onClick={(e) => handleToggleArchive(collection, e)}
            aria-label={collection.archived ? 'Restore collection' : 'Archive collection'}
            sx={{
              color: mutedInk,
              width: 30,
              height: 30,
              '&:hover': { color: colors.primary[500] },
            }}
          >
            {collection.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </IconButton>
        </Tooltip>

        <ChevronRight
          size={16}
          className="collection-chevron"
          style={{
            color: captionInk,
            opacity: 0.4,
            flexShrink: 0,
            transition: 'opacity 0.14s ease, transform 0.14s ease',
          }}
        />
      </Box>
    );
  };

  const listSurface = {
    borderRadius: '10px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100]}`,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.paper,
    overflow: 'hidden',
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 1, sm: 3 }, pb: 4 }}>
      {/* ─── Header ───────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2, sm: 0.5 },
          pt: { xs: 2.5, sm: 3.5 },
          pb: 1,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: captionInk,
              mb: 0.5,
              letterSpacing: '0.01em',
            }}
          >
            {totals.lists} collection{totals.lists !== 1 ? 's' : ''} · {totals.entries} entr
            {totals.entries !== 1 ? 'ies' : 'y'} outside the log
          </Typography>
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '1.75rem', sm: '2.25rem' },
              color: theme.palette.text.primary,
              lineHeight: 1.2,
            }}
          >
            Collections
          </Typography>
        </Box>

        <Button
          onClick={() => setCreateOpen(true)}
          variant="contained"
          size="small"
          startIcon={<Plus size={15} />}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', flexShrink: 0 }}
        >
          New
        </Button>
      </Box>

      <Box sx={{ mt: 2.5, px: { xs: 0.5, sm: 0 } }}>
        {loading && active.length === 0 && archived.length === 0 ? (
          <SkeletonLoader rows={4} />
        ) : active.length === 0 && archived.length === 0 ? (
          <EmptyState
            title="No collections yet."
            description="A collection is a list that lives outside the daily log — “Books to Read”, “Project X”, “Gift Ideas”. Entries stay put until you give one a due date."
          />
        ) : (
          <>
            {active.length > 0 && <Box sx={listSurface}>{active.map(renderCard)}</Box>}

            {active.length === 0 && archived.length > 0 && (
              <Typography
                sx={{ fontSize: '0.875rem', fontStyle: 'italic', color: mutedInk, px: 0.5 }}
              >
                Every collection is archived.
              </Typography>
            )}

            {/* ─── Archived ─────────────────────────────────────── */}
            {archived.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Box
                  onClick={() => setShowArchived((v) => !v)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.75,
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { opacity: 0.8 },
                  }}
                >
                  <Archive size={13} color={captionInk} />
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: captionInk,
                    }}
                  >
                    Archived
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.75rem', fontWeight: 500, color: theme.palette.text.muted }}
                  >
                    {archived.length}
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.75rem', color: theme.palette.text.muted, ml: 0.5 }}
                  >
                    {showArchived ? 'hide' : 'show'}
                  </Typography>
                </Box>

                {showArchived && <Box sx={listSurface}>{archived.map(renderCard)}</Box>}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ─── Create dialog ────────────────────────────────────── */}
      <BujoDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="xs"
        eyebrow="A list outside the log"
        title="New Collection"
        primaryAction={
          <Button
            type="submit"
            form={FORM_ID}
            variant="contained"
            size="small"
            disabled={saving || !form.name.trim()}
            sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5 }}
          >
            Create
          </Button>
        }
        secondaryAction={
          <Button
            onClick={() => setCreateOpen(false)}
            size="small"
            sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
          >
            Cancel
          </Button>
        }
      >
        <Box component="form" id={FORM_ID} onSubmit={handleCreate}>
          <TextField
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            label="Name"
            placeholder="Books to Read"
            autoFocus
            required
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          />
          <TextField
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            label="Description"
            placeholder="Optional — what belongs in here?"
            fullWidth
            size="small"
          />
        </Box>
      </BujoDialog>
    </Box>
  );
};

export default CollectionsPage;
