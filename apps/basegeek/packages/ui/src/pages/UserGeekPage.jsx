import { useEffect, useState } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText, IconButton, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import api from '../api';
import useSharedAuthStore from '../store/sharedAuthStore.js';

export default function UserGeekPage() {
  console.log('UserGeekPage component rendering');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const { token } = useSharedAuthStore();

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data.users);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.response?.data?.message || 'Error fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  const handleDelete = async (id) => {
    setDeleting(id);
    setError('');
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.response?.data?.message || 'Error deleting user');
    } finally {
      setDeleting(null);
    }
  };

  const handleOpenCreate = () => {
    setForm({ username: '', email: '', password: '' });
    setOpenCreate(true);
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError('');
      await api.post('/users', form, { headers: { Authorization: `Bearer ${token}` } });
      setOpenCreate(false);
      await fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err.response?.data?.message || 'Error creating user');
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
          <Typography variant="h4" sx={{ mb: 0.5 }}>User Management</Typography>
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}>
        <List disablePadding>
          {users.map((user, idx) => (
            <ListItem
              key={user.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleDelete(user.id)}
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
          {users.length === 0 && !loading && (
            <ListItem sx={{ py: 4, justifyContent: 'center' }}>
              <ListItemText
                primary="No users found"
                secondary="There are no users in the system"
                primaryTypographyProps={{ textAlign: 'center', color: 'text.secondary' }}
                secondaryTypographyProps={{ textAlign: 'center' }}
              />
            </ListItem>
          )}
        </List>
      </Box>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>Create User</DialogTitle>
        <DialogContent>
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenCreate(false)} disabled={creating} size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={creating || !form.username || !form.email || !form.password}>
            {creating ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
