import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  TextField,
  Button,
  Stack,
  MenuItem,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import GroupIcon from '@mui/icons-material/Group';
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PageCard from '../components/PageCard.jsx';
import { useNotifications } from '../components/Notifications.jsx';

const PURPOSES = ['core_flock', 'meat_run'];

const PURPOSE_LABELS = {
  'core_flock': 'Core Flock',
  'meat_run': 'Meat Run'
};

const PURPOSE_COLORS = {
  'core_flock': 'primary',
  'meat_run': 'error'
};

const GroupCard = ({
  group,
  onDelete,
  onEdit,
  birdCount,
  isEditing,
  editForm,
  setEditForm,
  onSaveEdit,
  onCancelEdit,
  onBulkEdit
}) => {
  const getPurposeColor = (purpose) => PURPOSE_COLORS[purpose] || 'default';
  const getPurposeLabel = (purpose) => PURPOSE_LABELS[purpose] || purpose;

  if (isEditing) {
    return (
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          border: 2,
          borderColor: 'primary.main'
        }}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          <form onSubmit={onSaveEdit}>
            <Stack spacing={2}>
              <TextField
                label="Group Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                fullWidth
                size="small"
              />
              <TextField
                select
                label="Purpose"
                value={editForm.purpose}
                onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
                fullWidth
                size="small"
              >
                {PURPOSES.map(p => (
                  <MenuItem key={p} value={p}>
                    {PURPOSE_LABELS[p] || p}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  onClick={onCancelEdit}
                  startIcon={<CancelIcon />}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  Save
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3
        }
      }}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Stack spacing={2}>
          {/* Header with Avatar and Actions */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <GroupIcon />
            </Avatar>

            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Bulk Edit Birds">
                <IconButton size="small" onClick={() => onBulkEdit(group)} color="primary">
                  <EditNoteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => onEdit(group)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => onDelete(group._id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Group Info */}
          <Stack spacing={1}>
            <Typography variant="h6" component="div" noWrap>
              {group.name}
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              <Chip
                label={getPurposeLabel(group.purpose)}
                size="small"
                color={getPurposeColor(group.purpose)}
                variant="outlined"
              />
              <Chip
                icon={<PetsIcon />}
                label={`${birdCount || 0} birds`}
                size="small"
                variant="outlined"
              />
            </Stack>

            {/* Additional info could go here */}
            <Typography variant="body2" color="text.secondary">
              Created: {new Date(group.createdAt).toLocaleDateString()}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ name: '', purpose: 'core_flock' });
  const [groupBirdCounts, setGroupBirdCounts] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', purpose: 'core_flock' });
  const [bulkEditGroup, setBulkEditGroup] = useState(null);
  const [bulkEditForm, setBulkEditForm] = useState({ locationId: '', status: '' });
  const [locations, setLocations] = useState([]);
  const { showSuccess, showError } = useNotifications();

  async function load() {
    const items = await api.listGroups();
    setGroups(items);

    // Load bird counts for each group
    const counts = {};
    await Promise.all(
      items.map(async (group) => {
        try {
          const memberships = await api.getGroupBirds(group._id);
          counts[group._id] = memberships.length;
        } catch {
          counts[group._id] = 0;
        }
      })
    );
    setGroupBirdCounts(counts);

    // Load locations
    try {
      const locationsList = await api.listLocations();
      setLocations(locationsList);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    if (!form.name) return;
    await api.createGroup({ name: form.name, purpose: form.purpose });
    setForm({ name: '', purpose: 'core_flock' });
    load();
  }

  function startEdit(group) {
    setEditingId(group._id);
    setEditForm({ name: group.name, purpose: group.purpose });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', purpose: 'core_flock' });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editForm.name) return;
    await api.updateGroup(editingId, { name: editForm.name, purpose: editForm.purpose });
    setEditingId(null);
    setEditForm({ name: '', purpose: 'core_flock' });
    load();
  }

  async function onDelete(id) {
    await fetch(`/api/flockgeek/v1/groups/${id}`, { method: 'DELETE', headers: { 'X-Owner-Id': localStorage.getItem('ownerId') || 'demo-owner' } });
    load();
  }

  function openBulkEdit(group) {
    setBulkEditGroup(group);
    setBulkEditForm({ locationId: '', status: '' });
  }

  function closeBulkEdit() {
    setBulkEditGroup(null);
    setBulkEditForm({ locationId: '', status: '' });
  }

  async function saveBulkEdit() {
    if (!bulkEditGroup) return;

    try {
      // Get all birds in the group
      const memberships = await api.getGroupBirds(bulkEditGroup._id);

      // Update each bird
      const updates = memberships.map(async (membership) => {
        const updateData = {};
        if (bulkEditForm.locationId) {
          updateData.locationId = bulkEditForm.locationId;
        }
        if (bulkEditForm.status) {
          updateData.status = bulkEditForm.status;
        }

        if (Object.keys(updateData).length > 0) {
          await api.updateBird(membership.birdId._id, updateData);
        }
      });

      await Promise.all(updates);
      showSuccess(`Updated ${memberships.length} birds in ${bulkEditGroup.name}`);
      closeBulkEdit();
    } catch (err) {
      showError(`Failed to bulk update: ${err.message}`);
    }
  }

  return (
    <Stack spacing={4}>
      <PageCard title="Add Group">
        <form onSubmit={onCreate}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="end">
            <TextField
              label="Group Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              sx={{ flexGrow: 1 }}
              placeholder="Enter group name"
            />
            <TextField
              select
              label="Purpose"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              sx={{ minWidth: 200 }}
            >
              {PURPOSES.map(p => (
                <MenuItem key={p} value={p}>
                  {PURPOSE_LABELS[p] || p}
                </MenuItem>
              ))}
            </TextField>
            <Button
              type="submit"
              variant="contained"
              size="large"
              sx={{ minWidth: 120 }}
            >
              Add Group
            </Button>
          </Stack>
        </form>
      </PageCard>

      <PageCard title={`Groups (${groups.length})`}>
        <Grid container spacing={3}>
          {groups.map((group) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={group._id}>
              <GroupCard
                group={group}
                onDelete={onDelete}
                onEdit={startEdit}
                birdCount={groupBirdCounts[group._id] || 0}
                isEditing={editingId === group._id}
                editForm={editForm}
                setEditForm={setEditForm}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onBulkEdit={openBulkEdit}
              />
            </Grid>
          ))}
          {groups.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <GroupIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No groups found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create your first group using the form above
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </PageCard>

      {/* Bulk Edit Dialog */}
      <Dialog open={!!bulkEditGroup} onClose={closeBulkEdit} maxWidth="sm" fullWidth>
        <DialogTitle>
          Bulk Edit Birds in "{bulkEditGroup?.name}"
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Update all {groupBirdCounts[bulkEditGroup?._id] || 0} birds in this group at once.
              Leave fields empty to keep existing values.
            </Typography>

            <TextField
              select
              label="Location (Optional)"
              value={bulkEditForm.locationId}
              onChange={(e) => setBulkEditForm({ ...bulkEditForm, locationId: e.target.value })}
              fullWidth
            >
              <MenuItem value="">— Keep Current —</MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc._id} value={loc._id}>
                  {loc.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Status (Optional)"
              value={bulkEditForm.status}
              onChange={(e) => setBulkEditForm({ ...bulkEditForm, status: e.target.value })}
              fullWidth
            >
              <MenuItem value="">— Keep Current —</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="meat run">Meat Run</MenuItem>
              <MenuItem value="retired">Retired</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBulkEdit}>Cancel</Button>
          <Button
            onClick={saveBulkEdit}
            variant="contained"
            disabled={!bulkEditForm.locationId && !bulkEditForm.status}
          >
            Update All Birds
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
