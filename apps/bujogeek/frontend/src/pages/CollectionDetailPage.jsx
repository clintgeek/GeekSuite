import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Dialog,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  Button,
  useTheme,
} from '@mui/material';
import {
  ChevronLeft,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Pencil,
  Trash2,
} from 'lucide-react';
import { GET_COLLECTION } from '../graphql/queries';
import { useTaskContext } from '../context/TaskContext';
import useCollections from '../hooks/useCollections';
import useKeyboardNav from '../hooks/useKeyboardNav';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import InlineQuickAdd from '../components/today/InlineQuickAdd';
import TaskRow from '../components/tasks/TaskRow';
import TaskEditor from '../components/tasks/TaskEditor';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import EmptyState from '../components/shared/EmptyState';
import { useToast } from '../components/shared/Toast';
import { colors } from '../theme/colors';

/**
 * CollectionDetailPage — one collection and its entries.
 *
 * Entries behave exactly like daily-log tasks (complete, cancel, edit, delete,
 * migrate) and reuse TaskRow plus the TaskContext handlers. What differs is
 * gravity: an entry added here is undated by default, so it stays in this list
 * and out of Today until someone gives it a due date.
 */
const CollectionDetailPage = () => {
  const { id } = useParams();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const toast = useToast();
  const { createTask, updateTaskStatus, deleteTask } = useTaskContext();
  const { updateCollection, deleteCollection } = useCollections();

  const { data, loading, refetch } = useQuery(GET_COLLECTION, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  });

  const [editingTask, setEditingTask] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameForm, setRenameForm] = useState({ name: '', description: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const collection = data?.collection ?? null;
  const tasks = useMemo(() => collection?.tasks ?? [], [collection]);

  const { open: openTasks, done: doneTasks } = useMemo(() => {
    const open = [];
    const done = [];
    tasks.forEach((task) => {
      if (task.status === 'completed' || task.status === 'cancelled') done.push(task);
      else open.push(task);
    });
    return { open, done };
  }, [tasks]);

  // ─── Entry handlers — the same context operations the daily log uses ───
  const handleAdd = useCallback(async (taskData) => {
    try {
      await createTask(taskData);
    } catch {
      return; // the context has already surfaced the error
    }
    refetch();
  }, [createTask, refetch]);

  const handleStatusToggle = useCallback(async (task) => {
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task.id || task._id, next);
    refetch();
  }, [updateTaskStatus, refetch]);

  const handleCancelToggle = useCallback(async (task) => {
    const next = task.status === 'cancelled' ? 'pending' : 'cancelled';
    await updateTaskStatus(task.id || task._id, next);
    refetch();
  }, [updateTaskStatus, refetch]);

  const handleDelete = useCallback(async (task) => {
    if (!window.confirm('Delete this entry?')) return;
    await deleteTask(task.id || task._id);
    refetch();
  }, [deleteTask, refetch]);

  const handleEdit = useCallback((task) => setEditingTask(task), []);

  // ─── Collection handlers ───
  const handleToggleArchive = async () => {
    setMenuAnchor(null);
    try {
      await updateCollection(collection.id, { archived: !collection.archived });
      await refetch();
      toast.success(collection.archived ? 'Collection restored' : 'Collection archived');
    } catch {
      toast.error('Failed to update collection');
    }
  };

  const openRename = () => {
    setMenuAnchor(null);
    setRenameForm({ name: collection?.name || '', description: collection?.description || '' });
    setRenameOpen(true);
  };

  const handleRename = async (event) => {
    event?.preventDefault();
    const name = renameForm.name.trim();
    if (!name) return;
    try {
      await updateCollection(collection.id, { name, description: renameForm.description.trim() });
      await refetch();
      setRenameOpen(false);
    } catch {
      toast.error('Failed to rename collection');
    }
  };

  const handleDeleteCollection = async (deleteTasks) => {
    try {
      await deleteCollection(collection.id, deleteTasks);
      setDeleteOpen(false);
      toast.success(
        deleteTasks ? 'Collection and its entries deleted' : 'Collection deleted; entries kept'
      );
      navigate('/collections');
    } catch {
      toast.error('Failed to delete collection');
    }
  };

  const { focusedTaskId } = useKeyboardNav({
    tasks: openTasks,
    onToggle: handleStatusToggle,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onCancel: handleCancelToggle,
    enabled: !loading && !editingTask && !renameOpen && !deleteOpen,
  });

  useGlobalShortcuts();

  const captionInk = isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  const listSurface = {
    borderRadius: '10px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100]}`,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.paper,
    overflow: 'hidden',
  };

  const renderRows = (rows) => (
    <Box sx={listSurface}>
      {rows.map((task, i) => (
        <Box
          key={task.id || task._id}
          sx={{
            borderBottom:
              i < rows.length - 1
                ? `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : colors.ink[50]}`
                : 'none',
          }}
        >
          <TaskRow
            task={task}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCancel={handleCancelToggle}
            focused={(task.id || task._id) === focusedTaskId}
          />
        </Box>
      ))}
    </Box>
  );

  if (!loading && !collection) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 1, sm: 3 }, pt: 4 }}>
        <EmptyState
          title="That collection isn’t here."
          description="It may have been deleted, or it belongs to someone else."
        />
        <Button
          onClick={() => navigate('/collections')}
          size="small"
          sx={{ textTransform: 'none', ml: 2 }}
        >
          Back to collections
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 1, sm: 3 }, pb: 4 }}>
      {/* ─── Header ───────────────────────────────────────────── */}
      <Box sx={{ px: { xs: 2, sm: 0.5 }, pt: { xs: 2.5, sm: 3.5 }, pb: 1 }}>
        <Box
          onClick={() => navigate('/collections')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/collections'); }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            mb: 1,
            cursor: 'pointer',
            color: captionInk,
            '&:hover': { color: mutedInk },
          }}
        >
          <ChevronLeft size={14} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>Collections</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
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
              {collection
                ? `${collection.completedCount || 0} of ${collection.taskCount || 0} done${
                    collection.archived ? ' · archived' : ''
                  }`
                : ' '}
            </Typography>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '1.75rem', sm: '2.25rem' },
                color: theme.palette.text.primary,
                lineHeight: 1.2,
              }}
            >
              {collection?.name || ' '}
            </Typography>
            {collection?.description && (
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: '0.9375rem',
                  fontStyle: 'italic',
                  color: mutedInk,
                  mt: 0.75,
                  lineHeight: 1.5,
                }}
              >
                {collection.description}
              </Typography>
            )}
          </Box>

          {collection && (
            <>
              <Tooltip title="Collection actions" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                  aria-label="Collection actions"
                  sx={{ color: mutedInk, flexShrink: 0, mt: 1 }}
                >
                  <MoreHorizontal size={18} />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem onClick={openRename} sx={{ fontSize: '0.875rem', gap: 1.25 }}>
                  <Pencil size={15} /> Rename
                </MenuItem>
                <MenuItem onClick={handleToggleArchive} sx={{ fontSize: '0.875rem', gap: 1.25 }}>
                  {collection.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  {collection.archived ? 'Restore' : 'Archive'}
                </MenuItem>
                <MenuItem
                  onClick={() => { setMenuAnchor(null); setDeleteOpen(true); }}
                  sx={{ fontSize: '0.875rem', gap: 1.25, color: colors.aging.overdue }}
                >
                  <Trash2 size={15} /> Delete…
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Box>

      {/* ─── Quick add — collection-scoped, undated by default ─── */}
      {collection && (
        <InlineQuickAdd
          onAdd={handleAdd}
          collectionId={collection.id}
          promptLabel={`Add to ${collection.name}`}
          placeholder="What belongs on this list?"
          autoFocus={!loading && tasks.length === 0}
        />
      )}

      {loading && !collection ? (
        <Box sx={{ mt: 1, px: { xs: 0.5, sm: 0 } }}>
          <SkeletonLoader rows={5} />
        </Box>
      ) : (
        <Box sx={{ mt: 1.5, px: { xs: 0.5, sm: 0 } }}>
          {tasks.length === 0 ? (
            <EmptyState
              title="Nothing on this list yet."
              description="Entries added here stay out of the daily log. Give one a due date — with /tomorrow, or in the editor — and it will show up in Today."
            />
          ) : (
            <>
              {openTasks.length > 0 && renderRows(openTasks)}

              {doneTasks.length > 0 && (
                <Box sx={{ mt: openTasks.length > 0 ? 2.5 : 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: captionInk,
                      mb: 0.75,
                    }}
                  >
                    Done · {doneTasks.length}
                  </Typography>
                  {renderRows(doneTasks)}
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      <TaskEditor
        open={Boolean(editingTask)}
        onClose={() => { setEditingTask(null); refetch(); }}
        task={editingTask}
      />

      {/* ─── Rename dialog ────────────────────────────────────── */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}
      >
        <form onSubmit={handleRename}>
          <DialogContent sx={{ px: 3, pt: 3, pb: 2 }}>
            <Typography
              component="h2"
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '1.25rem',
                fontWeight: 500,
                mb: 2.5,
                color: theme.palette.text.primary,
              }}
            >
              Rename Collection
            </Typography>
            <TextField
              value={renameForm.name}
              onChange={(e) => setRenameForm({ ...renameForm, name: e.target.value })}
              label="Name"
              autoFocus
              required
              fullWidth
              size="small"
              sx={{ mb: 2 }}
            />
            <TextField
              value={renameForm.description}
              onChange={(e) => setRenameForm({ ...renameForm, description: e.target.value })}
              label="Description"
              fullWidth
              size="small"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: dottedRule, gap: 1 }}>
            <Button
              onClick={() => setRenameOpen(false)}
              size="small"
              sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="small"
              disabled={!renameForm.name.trim()}
              sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none' }}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─── Delete dialog — detach or cascade ────────────────── */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}
      >
        <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '1.25rem',
              fontWeight: 500,
              mb: 1.5,
              color: theme.palette.text.primary,
            }}
          >
            Delete “{collection?.name}”?
          </Typography>
          <DialogContentText sx={{ fontSize: '0.875rem', color: mutedInk }}>
            {tasks.length === 0
              ? 'This collection is empty, so nothing else will be lost.'
              : `It holds ${tasks.length} entr${tasks.length !== 1 ? 'ies' : 'y'}. You can keep them as ordinary tasks, or delete them along with the collection.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button
            onClick={() => setDeleteOpen(false)}
            size="small"
            sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none', mr: 'auto' }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteCollection(false)}
            size="small"
            sx={{ fontSize: '0.8125rem', textTransform: 'none' }}
          >
            Delete, keep entries
          </Button>
          <Button
            onClick={() => handleDeleteCollection(true)}
            size="small"
            sx={{
              fontSize: '0.8125rem',
              textTransform: 'none',
              fontWeight: 600,
              color: colors.aging.overdue,
            }}
          >
            Delete everything
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CollectionDetailPage;
