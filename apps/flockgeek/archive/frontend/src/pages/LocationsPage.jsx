import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  TextField,
  Button,
  Stack,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Avatar,
  Fab,
  Modal,
  Paper,
  Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import PageCard from '../components/PageCard.jsx';
import { useNotifications } from '../components/Notifications.jsx';

const LocationCard = ({
  location,
  onDelete,
  onEdit,
  birdCount,
  isEditing,
  editForm,
  setEditForm,
  onSaveEdit,
  onCancelEdit
}) => {
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
                label="Location Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                fullWidth
                size="small"
              />
              <TextField
                label="Description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                fullWidth
                size="small"
                multiline
                rows={2}
              />
              <TextField
                label="Capacity"
                type="number"
                value={editForm.capacity}
                onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })}
                fullWidth
                size="small"
              />
              <TextField
                label="Notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                fullWidth
                size="small"
                multiline
                rows={2}
              />
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
            <Avatar sx={{ bgcolor: 'warning.main' }}>
              <LocationOnIcon />
            </Avatar>

            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => onEdit(location)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => onDelete(location._id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Location Info */}
          <Stack spacing={1}>
            <Typography variant="h6" component="div" noWrap>
              {location.name}
            </Typography>

            {location.description && (
              <Typography variant="body2" color="text.secondary">
                {location.description}
              </Typography>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              <Chip
                icon={<PetsIcon />}
                label={`${birdCount || 0} birds`}
                size="small"
                variant="outlined"
                color="primary"
              />
              {location.capacity && (
                <Chip
                  label={`Capacity: ${location.capacity}`}
                  size="small"
                  variant="outlined"
                  color="warning"
                />
              )}
            </Stack>

            {location.notes && (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {location.notes}
              </Typography>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', capacity: '', notes: '' });
  const [locationBirdCounts, setLocationBirdCounts] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', capacity: '', notes: '' });
  const [openModal, setOpenModal] = useState(false);
  const { showSuccess, showError } = useNotifications();

  async function load() {
    try {
      const items = await api.listLocations();
      setLocations(items);

      // Load bird counts for each location
      const counts = {};
      await Promise.all(
        items.map(async (location) => {
          try {
            const birds = await api.listBirds({ locationId: location._id });
            counts[location._id] = birds.length;
          } catch {
            counts[location._id] = 0;
          }
        })
      );
      setLocationBirdCounts(counts);
    } catch (err) {
      showError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    if (!form.name) return;
    try {
      await api.createLocation({
        name: form.name,
        description: form.description || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        notes: form.notes || undefined
      });
      setForm({ name: '', description: '', capacity: '', notes: '' });
      load();
      showSuccess('Location created successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  function startEdit(location) {
    setEditingId(location._id);
    setEditForm({
      name: location.name,
      description: location.description || '',
      capacity: location.capacity || '',
      notes: location.notes || ''
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', description: '', capacity: '', notes: '' });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editForm.name) return;
    try {
      await api.updateLocation(editingId, {
        name: editForm.name,
        description: editForm.description || undefined,
        capacity: editForm.capacity ? parseInt(editForm.capacity) : undefined,
        notes: editForm.notes || undefined
      });
      setEditingId(null);
      setEditForm({ name: '', description: '', capacity: '', notes: '' });
      load();
      showSuccess('Location updated successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  async function onDelete(id) {
    try {
      await api.deleteLocation(id);
      load();
      showSuccess('Location deleted successfully');
    } catch (err) {
      showError(err.message);
    }
  }

  const handleOpenModal = () => {
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
  };

  const handleCreateLocation = (e) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      api.createLocation({
        name: form.name,
        description: form.description || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        notes: form.notes || undefined
      });
      setForm({ name: '', description: '', capacity: '', notes: '' });
      load();
      showSuccess('Location created successfully');
      handleCloseModal();
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <Stack spacing={4}>
      <PageCard title="Locations">
        <Grid container spacing={3}>
          {locations.map((location) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={location._id}>
              <LocationCard
                location={location}
                onDelete={onDelete}
                onEdit={startEdit}
                birdCount={locationBirdCounts[location._id] || 0}
                isEditing={editingId === location._id}
                editForm={editForm}
                setEditForm={setEditForm}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
              />
            </Grid>
          ))}
          {locations.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <LocationOnIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No locations found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create your first location using the form below
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </PageCard>

      <Box sx={{ position: 'fixed', bottom: 24, right: 24 }}>
        <Fab color="primary" aria-label="add" onClick={handleOpenModal}>
          <AddIcon />
        </Fab>
      </Box>

      <Modal
        open={openModal}
        onClose={handleCloseModal}
        aria-labelledby="add-location-modal"
        aria-describedby="add-location-form"
      >
        <Paper
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: { xs: '90%', sm: 500 },
            maxWidth: '90%',
            p: 3,
            borderRadius: 2,
            boxShadow: 24,
            outline: 'none'
          }}
        >
          <Typography id="add-location-modal" variant="h6" component="h2" gutterBottom>
            Add New Location
          </Typography>
          <form onSubmit={handleCreateLocation}>
            <Stack spacing={2}>
              <TextField
                label="Location Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                fullWidth
                size="small"
              />
              <TextField
                label="Description (Optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                fullWidth
                size="small"
                multiline
                rows={2}
              />
              <TextField
                label="Capacity (Optional)"
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                fullWidth
                size="small"
              />
              <TextField
                label="Notes (Optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                fullWidth
                size="small"
                multiline
                rows={2}
              />
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button
                  type="button"
                  onClick={handleCloseModal}
                  variant="outlined"
                  size="small"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  size="small"
                >
                  Create Location
                </Button>
              </Stack>
            </Stack>
          </form>
        </Paper>
      </Modal>
    </Stack>
  );
}