import { useEffect, useId, useState } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText, IconButton, CircularProgress, TextField, Button, Stack } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { GeekEmptyState, GeekErrorState, useToast } from '@geeksuite/ui';
import ConsoleDialog from '../components/primitives/ConsoleDialog';
import api from '../api';

export default function UserGeekPage() {
  const formId = useId();
  const { notify } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Only the initial (or retried) load replaces the list with GeekErrorState;
  // a delete/create failure doesn't blow away a list the user can already
  // see, so those become toasts instead (TODO_ORDER #15).
  const [loadError, setLoadError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // Going-over 2026-09-05: the trash icon used to call DELETE /users/:id
  // straight from its onClick. One mis-tap permanently removed a suite user's
  // `userGeek` record — the most destructive action in this console, and the
  // only one with no confirmation, while resetting AI stats and revoking an
  // API key both sit behind a ConsoleDialog. There is no undo on the server,
  // so the dialog is the undo.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });

  const fetchUsers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get('/users');
      setUsers(res.data.users);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Error fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async () => {
    const target = confirmDelete;
    if (!target) return;
    setDeleting(target.id);
    try {
      await api.delete(`/users/${target.id}`);
      setConfirmDelete(null);
      await fetchUsers();
    } catch (err) {
      notify(err.response?.data?.message || 'Error deleting user', { tone: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const handleOpenCreate = () => {
    setForm({ username: '', email: '', password: '' });
    setOpenCreate(true);
  };

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    try {
      setCreating(true);
      await api.post('/users', form);
      setOpenCreate(false);
      await fetchUsers();
    } catch (err) {
      notify(err.response?.data?.message || 'Error creating user', { tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Manage users across the GeekSuite applications
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          size="small"
        >
          Add user
        </Button>
      </Box>

      {loadError ? (
        <Box sx={{
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        }}>
          <GeekErrorState title="Couldn't load users" error={loadError} onRetry={fetchUsers} />
        </Box>
      ) : (
        <Box sx={{
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          overflow: 'hidden',
        }}>
          {users.length === 0 ? (
            <GeekEmptyState
              title="No users found"
              description="There are no users in the system"
            />
          ) : (
            <List disablePadding>
              {users.map((user, idx) => (
                <ListItem
                  key={user.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => setConfirmDelete(user)}
                      disabled={deleting === user.id}
                      size="small"
                      sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                    >
                      {deleting === user.id ? (
                        <CircularProgress size={18} />
                      ) : (
                        <DeleteIcon fontSize="small" />
                      )}
                    </IconButton>
                  }
                  sx={{
                    borderBottom: idx < users.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    py: 1.5,
                    px: 2.5,
                  }}
                >
                  <ListItemText
                    primary={user.username}
                    secondary={user.email}
                    primaryTypographyProps={{ fontWeight: 500, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}

      <ConsoleDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        eyebrow="User"
        title={`Delete ${confirmDelete?.username ?? 'user'}?`}
        primaryAction={
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            size="small"
            disabled={!!deleting}
          >
            {deleting ? <CircularProgress size={18} /> : 'Delete user'}
          </Button>
        }
        secondaryAction={
          <Button onClick={() => setConfirmDelete(null)} disabled={!!deleting} size="small">
            Cancel
          </Button>
        }
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          This removes {confirmDelete?.username}
          {confirmDelete?.email ? ` (${confirmDelete.email})` : ''} from userGeek across every
          GeekSuite app. It cannot be undone.
        </Typography>
      </ConsoleDialog>

      <ConsoleDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        eyebrow="User"
        title="Create user"
        primaryAction={
          <Button
            type="submit"
            form={formId}
            variant="contained"
            size="small"
            disabled={creating || !form.username || !form.email || !form.password}
          >
            {creating ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        }
        secondaryAction={<Button onClick={() => setOpenCreate(false)} disabled={creating} size="small">Cancel</Button>}
      >
        <form id={formId} onSubmit={handleCreate}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoFocus
              size="small"
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              size="small"
            />
            <TextField
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              size="small"
            />
          </Stack>
        </form>
      </ConsoleDialog>
    </Box>
  );
}
