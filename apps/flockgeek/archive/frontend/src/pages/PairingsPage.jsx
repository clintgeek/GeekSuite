import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useNotifications } from '../components/Notifications.jsx';
import { TextField, Button, Stack, List, ListItem, ListItemText, IconButton, Tooltip, MenuItem, Typography, Box, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import PageCard from '../components/PageCard.jsx';

const STATUSES = ['active','completed','cancelled'];

export default function PairingsPage() {
  const [pairings, setPairings] = useState([]);
  const [form, setForm] = useState({ roosterIds: [], henIds: [], goals: [], status: 'active' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ goals: [], status: '' });
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const { showSuccess, showError } = useNotifications();

  async function load() {
    const items = await api.listPairings();
    setPairings(items);
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    if (!form.roosterIds.length || !form.henIds.length) return;
    try {
      await api.createPairing(form);
      setForm({ roosterIds: [], henIds: [], goals: [], status: 'active' });
      load();
      showSuccess('Pairing created successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  async function onDelete(id) {
    try {
      await api.deletePairing(id);
      load();
      showSuccess('Pairing deleted successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  function startEdit(p) {
    setEditing(p._id);
    setEditForm({ goals: p.goals || [], status: p.status || '' });
  }

  async function saveEdit(id) {
    try {
      await api.updatePairing(id, { goals: editForm.goals, status: editForm.status || undefined });
      setEditing(null);
      load();
      showSuccess('Pairing updated successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  async function onSelect(p) {
    setSelected(p);
    try {
      const data = await api.getPairingSummary(p._id);
      setSummary(data);
    } catch (err) {
      setSummary({ error: err.message });
    }
  }

  return (
    <Stack spacing={4}>
      <PageCard title="Add Pairing">
        <form onSubmit={onCreate}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Rooster IDs (comma-separated)" value={form.roosterIds.join(',')} onChange={(e) => setForm({ ...form, roosterIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} required />
              <TextField label="Hen IDs (comma-separated)" value={form.henIds.join(',')} onChange={(e) => setForm({ ...form, henIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} required />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Goals (comma-separated)" value={form.goals.join(',')} onChange={(e) => setForm({ ...form, goals: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
              <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <Button type="submit" variant="contained">Add</Button>
            </Stack>
          </Stack>
        </form>
      </PageCard>

      <PageCard title="Pairings" sx={{ p: 0 }}>
        <List dense sx={{ py: 0 }}>
          {pairings.map((p) => (
            <ListItem key={p._id} divider sx={{ px: 2, cursor: 'pointer', bgcolor: selected?._id === p._id ? 'action.selected' : 'transparent' }}
              onClick={() => onSelect(p)}
              secondaryAction={
                editing === p._id ? (
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Save"><IconButton onClick={() => saveEdit(p._id)}><SaveIcon /></IconButton></Tooltip>
                    <Tooltip title="Cancel"><IconButton onClick={() => setEditing(null)}><CancelIcon /></IconButton></Tooltip>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Edit"><IconButton onClick={() => startEdit(p)}><EditIcon /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton onClick={() => onDelete(p._id)}><DeleteIcon /></IconButton></Tooltip>
                  </Stack>
                )
              }
            >
              {editing === p._id ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%' }}>
                  <TextField label="Goals" size="small" value={editForm.goals.join(',')} onChange={(e) => setEditForm({ ...editForm, goals: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  <TextField select label="Status" size="small" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    {STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                </Stack>
              ) : (
                <ListItemText
                  primary={`${p.roosterIds.join(', ')} × ${p.henIds.join(', ')}`}
                  secondary={`${p.status}${p.goals.length ? ' • ' + p.goals.join(', ') : ''}`}
                />
              )}
            </ListItem>
          ))}
        </List>
      </PageCard>

      {selected && (
        <PageCard title="Pairing Summary">
          {summary?.error ? (
            <Typography color="error">{summary.error}</Typography>
          ) : summary ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" gutterBottom>Breeding Pair</Typography>
                <Typography>Roosters: {selected.roosterIds.join(', ')}</Typography>
                <Typography>Hens: {selected.henIds.join(', ')}</Typography>
                <Typography>Status: <Chip label={selected.status} size="small" /></Typography>
              </Box>
              {summary.metrics && (
                <Box>
                  <Typography variant="h6" gutterBottom>Metrics</Typography>
                  <Typography>Hatch Rate: {summary.metrics.hatchRate || '—'}%</Typography>
                  <Typography>Fertility: {summary.metrics.fertilityRate || '—'}%</Typography>
                  <Typography>Pullets: {summary.metrics.pulletsRatio || '—'}%</Typography>
                </Box>
              )}
              {summary.coi && (
                <Box>
                  <Typography variant="h6" gutterBottom>Inbreeding Check</Typography>
                  <Typography>COI: {summary.coi.toFixed(2)}%</Typography>
                  <Chip
                    label={summary.coi >= 12.5 ? 'BLOCK' : summary.coi >= 6.25 ? 'WARN' : 'OK'}
                    color={summary.coi >= 12.5 ? 'error' : summary.coi >= 6.25 ? 'warning' : 'success'}
                    size="small"
                  />
                </Box>
              )}
            </Stack>
          ) : (
            <Typography>Loading...</Typography>
          )}
        </PageCard>
      )}
    </Stack>
  );
}
