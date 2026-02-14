import React, { useState, useEffect } from 'react';
import {
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  Chip,
  Box,
  Alert,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ScaleIcon from '@mui/icons-material/Scale';
import { api } from '../lib/api.js';
import { useNotifications } from './Notifications.jsx';
import LineChart from './LineChart.jsx';

const FEATHER_COLORS = [
  'Black', 'White', 'Red', 'Brown', 'Buff', 'Gray', 'Blue', 'Green', 'Gold', 'Silver', 'Mixed'
];

const PATTERNS = [
  'Solid', 'Barred', 'Laced', 'Spangled', 'Penciled', 'Striped', 'Mottled', 'Splash'
];

const COMB_TYPES = [
  'Single', 'Rose', 'Pea', 'Cushion', 'Strawberry', 'Buttercup', 'V-shaped'
];

const LEG_COLORS = [
  'Yellow', 'Black', 'White', 'Blue', 'Green', 'Pink', 'Red', 'Gray'
];

export default function BirdTraits({ birdId }) {
  const [traits, setTraits] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrait, setEditingTrait] = useState(null);
  const [form, setForm] = useState({
    loggedAt: new Date().toISOString().split('T')[0],
    weightGrams: '',
    featherColor: '',
    pattern: '',
    combType: '',
    legColor: '',
    notes: ''
  });
  const { showSuccess, showError } = useNotifications();

  const loadData = async () => {
    try {
      setLoading(true);
      const [traitsData, weightData] = await Promise.all([
        api.listBirdTraits({ birdId, limit: 100 }),
        api.getBirdWeightHistory(birdId, 180) // Last 6 months
      ]);
      setTraits(traitsData);
      setWeightHistory(weightData.weightHistory || []);
    } catch (error) {
      showError('Failed to load bird traits: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (birdId) {
      loadData();
    }
  }, [birdId]);

  const resetForm = () => {
    setForm({
      loggedAt: new Date().toISOString().split('T')[0],
      weightGrams: '',
      featherColor: '',
      pattern: '',
      combType: '',
      legColor: '',
      notes: ''
    });
    setEditingTrait(null);
  };

  const openDialog = (trait = null) => {
    if (trait) {
      setEditingTrait(trait);
      setForm({
        loggedAt: new Date(trait.loggedAt).toISOString().split('T')[0],
        weightGrams: trait.weightGrams ? trait.weightGrams.toString() : '',
        featherColor: trait.featherColor || '',
        pattern: trait.pattern || '',
        combType: trait.combType || '',
        legColor: trait.legColor || '',
        notes: trait.notes || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        birdId,
        loggedAt: form.loggedAt,
        weightGrams: form.weightGrams ? parseInt(form.weightGrams) : undefined,
        featherColor: form.featherColor || undefined,
        pattern: form.pattern || undefined,
        combType: form.combType || undefined,
        legColor: form.legColor || undefined,
        notes: form.notes || undefined
      };

      if (editingTrait) {
        await api.updateBirdTrait(editingTrait._id, payload);
        showSuccess('Bird trait updated successfully');
      } else {
        await api.createBirdTrait(payload);
        showSuccess('Bird trait recorded successfully');
      }

      closeDialog();
      loadData();
    } catch (error) {
      showError('Failed to save bird trait: ' + error.message);
    }
  };

  const handleDelete = async (traitId) => {
    if (!confirm('Are you sure you want to delete this trait record?')) return;

    try {
      await api.deleteBirdTrait(traitId);
      showSuccess('Bird trait deleted successfully');
      loadData();
    } catch (error) {
      showError('Failed to delete bird trait: ' + error.message);
    }
  };

  const formatWeight = (grams) => {
    if (!grams) return '';
    const kg = grams / 1000;
    const lbs = grams * 0.00220462;
    return `${grams}g (${kg.toFixed(2)}kg, ${lbs.toFixed(2)}lbs)`;
  };

  const getLatestWeight = () => {
    const weightTraits = traits.filter(t => t.weightGrams);
    if (weightTraits.length === 0) return null;
    return weightTraits.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0];
  };

  const latestWeight = getLatestWeight();

  if (loading) {
    return <Typography>Loading bird traits...</Typography>;
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Physical Traits & Weight</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openDialog()}
          size="small"
        >
          Log Traits
        </Button>
      </Box>

      {/* Current Weight Card */}
      {latestWeight && (
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <ScaleIcon color="primary" />
              <Box>
                <Typography variant="h6">Current Weight</Typography>
                <Typography variant="body1" color="primary">
                  {formatWeight(latestWeight.weightGrams)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Recorded: {new Date(latestWeight.loggedAt).toLocaleDateString()}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Weight Chart */}
      {weightHistory.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Weight History (6 months)</Typography>
            <Box sx={{ height: 200 }}>
              <LineChart
                data={weightHistory.map(w => ({
                  x: new Date(w.date).toLocaleDateString(),
                  y: w.weightGrams
                }))}
                xLabel="Date"
                yLabel="Weight (grams)"
                color="#4CAF50"
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Traits List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Trait Records</Typography>
          {traits.length === 0 ? (
            <Alert severity="info">No trait records yet. Add the first one!</Alert>
          ) : (
            <List dense>
              {traits.map((trait) => (
                <ListItem
                  key={trait._id}
                  divider
                  secondaryAction={
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small" onClick={() => openDialog(trait)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(trait._id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2" fontWeight="bold">
                          {new Date(trait.loggedAt).toLocaleDateString()}
                        </Typography>
                        {trait.weightGrams && (
                          <Chip
                            label={`${trait.weightGrams}g`}
                            color="primary"
                            size="small"
                            icon={<ScaleIcon />}
                          />
                        )}
                        {trait.featherColor && (
                          <Chip label={trait.featherColor} size="small" variant="outlined" />
                        )}
                        {trait.pattern && (
                          <Chip label={trait.pattern} size="small" variant="outlined" />
                        )}
                        {trait.combType && (
                          <Chip label={`${trait.combType} comb`} size="small" variant="outlined" />
                        )}
                        {trait.legColor && (
                          <Chip label={`${trait.legColor} legs`} size="small" variant="outlined" />
                        )}
                      </Stack>
                    }
                    secondary={trait.notes}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingTrait ? 'Edit Trait Record' : 'Log Bird Traits'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={form.loggedAt}
              onChange={(e) => setForm({ ...form, loggedAt: e.target.value })}
              fullWidth
              required
            />

            <TextField
              label="Weight (grams)"
              type="number"
              value={form.weightGrams}
              onChange={(e) => setForm({ ...form, weightGrams: e.target.value })}
              fullWidth
              inputProps={{ min: '0', step: '1' }}
              helperText="Leave empty if not weighing"
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Feather Color"
                  select
                  value={form.featherColor}
                  onChange={(e) => setForm({ ...form, featherColor: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {FEATHER_COLORS.map((color) => (
                    <MenuItem key={color} value={color}>{color}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Pattern"
                  select
                  value={form.pattern}
                  onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {PATTERNS.map((pattern) => (
                    <MenuItem key={pattern} value={pattern}>{pattern}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Comb Type"
                  select
                  value={form.combType}
                  onChange={(e) => setForm({ ...form, combType: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {COMB_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Leg Color"
                  select
                  value={form.legColor}
                  onChange={(e) => setForm({ ...form, legColor: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {LEG_COLORS.map((color) => (
                    <MenuItem key={color} value={color}>{color}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              fullWidth
              multiline
              rows={3}
              placeholder="Any additional observations..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingTrait ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}