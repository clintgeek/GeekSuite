import { useEffect, useId, useState } from 'react';
import { Box, Typography, IconButton, CircularProgress, TextField, Button, Stack } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { GeekEmptyState, GeekErrorState, useToast } from '@geeksuite/ui';
import ConsoleDialog from '../components/primitives/ConsoleDialog';
import api from '../api';
import Panel from '../signalbox/Panel';
import { Dymo } from '../signalbox/Labels';

/**
 * UserGeek — the token board.
 *
 * On a single line, a driver may only enter a section while holding its
 * token; in the suite, a userGeek record is that token — the authority to
 * sign in anywhere. So each user is a brass tablet (initials, brass for an
 * admin, steel for everyone else) on a row with their role on dymo tape and
 * the two dates that matter: when they were issued and when they last used it.
 *
 * Deleting a user withdraws their token from every app with no undo on the
 * server, which is why it stays behind the confirmation dialog.
 */
function initials(user) {
  const name = user.profile?.displayName || user.username || '?';
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function shortDate(value) {
  if (!value) return null;
  const d = new Date(Number.isFinite(Number(value)) ? Number(value) : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Token({ user }) {
  const admin = user.role === 'admin';
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.typography.fontFamilyMono,
        fontWeight: 700,
        fontSize: '0.875rem',
        color: admin ? theme.palette.box.plate.ink : '#ffffff',
        background: admin
          ? theme.palette.accent.gradient
          : 'linear-gradient(180deg, #5d6670, #2b3037)',
        border: `2px solid ${admin ? theme.palette.box.plate.edge : '#2b3037'}`,
        boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.4)',
      })}
    >
      {initials(user)}
    </Box>
  );
}

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

  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <Box>
      <Panel
        title="Token board"
        caption={loadError
          ? 'Every suite user holds one token: their userGeek record.'
          : `${users.length} ${users.length === 1 ? 'token' : 'tokens'} issued · ${adminCount} admin. A token signs its holder in to every GeekSuite app.`}
        actions={(
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleOpenCreate} size="small">
            Add user
          </Button>
        )}
      >
        {loadError ? (
          <GeekErrorState title="Couldn't load users" error={loadError} onRetry={fetchUsers} />
        ) : users.length === 0 ? (
          <GeekEmptyState title="No users found" description="There are no users in the system" />
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {users.map((user) => {
              const joined = shortDate(user.createdAt);
              const seen = shortDate(user.lastLogin);
              return (
                <Box
                  component="li"
                  key={user.id}
                  sx={{
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 'none' },
                  }}
                >
                  <Token user={user} />
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 0.5 }}>
                    <Box sx={{ minWidth: 0, flex: '1 1 200px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', overflowWrap: 'anywhere' }}>{user.username}</Typography>
                        {user.role && <Dymo tone={user.role === 'admin' ? 'red' : 'black'} tilt={false}>{user.role}</Dymo>}
                      </Box>
                      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>{user.email}</Typography>
                    </Box>
                    {(joined || seen) && (
                      <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5 }}>
                        {joined && <Box component="span" sx={{ display: 'block' }}>issued {joined}</Box>}
                        <Box component="span" sx={{ display: 'block' }}>last in {seen || 'never'}</Box>
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    aria-label="delete"
                    onClick={() => setConfirmDelete(user)}
                    disabled={deleting === user.id}
                    sx={{ width: 44, height: 44, color: 'text.secondary', '@media (hover: hover)': { '&:hover': { color: 'error.main' } } }}
                  >
                    {deleting === user.id ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        )}
      </Panel>

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
