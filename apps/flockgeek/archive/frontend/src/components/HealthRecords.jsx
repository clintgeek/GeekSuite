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
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../lib/api.js';
import { useNotifications } from './Notifications.jsx';

const HEALTH_TYPES = [
  { value: 'illness', label: 'Illness' },
  { value: 'injury', label: 'Injury' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'checkup', label: 'Checkup' },
  { value: 'cull', label: 'Cull' }
];

const OUTCOMES = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'culled', label: 'Culled' },
  { value: 'NA', label: 'N/A' }
];

const getTypeColor = (type) => {
  const colors = {
    illness: 'error',
    injury: 'warning',
    treatment: 'info',
    vaccination: 'success',
    checkup: 'primary',
    cull: 'error'
  };
  return colors[type] || 'default';
};

const getOutcomeColor = (outcome) => {
  const colors = {
    recovered: 'success',
    ongoing: 'warning',
    deceased: 'error',
    culled: 'error',
    NA: 'default'
  };
  return colors[outcome] || 'default';
};

export default function HealthRecords({ birdId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState({
    eventDate: new Date().toISOString().split('T')[0],
    type: 'checkup',
    diagnosis: '',
    treatment: '',
    outcome: 'ongoing',
    cullReason: '',
    vet: '',
    costCents: '',
    notes: ''
  });
  const { showSuccess, showError } = useNotifications();

  const loadRecords = async () => {
    try {
      setLoading(true);
      const data = await api.listHealthRecords({ birdId, limit: 100 });
      setRecords(data);
    } catch (error) {
      showError('Failed to load health records: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (birdId) {
      loadRecords();
    }
  }, [birdId]);

  const resetForm = () => {
    setForm({
      eventDate: new Date().toISOString().split('T')[0],
      type: 'checkup',
      diagnosis: '',
      treatment: '',
      outcome: 'ongoing',
      cullReason: '',
      vet: '',
      costCents: '',
      notes: ''
    });
    setEditingRecord(null);
  };

  const openDialog = (record = null) => {
    if (record) {
      setEditingRecord(record);
      setForm({
        eventDate: new Date(record.eventDate).toISOString().split('T')[0],
        type: record.type,
        diagnosis: record.diagnosis || '',
        treatment: record.treatment || '',
        outcome: record.outcome || 'ongoing',
        cullReason: record.cullReason || '',
        vet: record.vet || '',
        costCents: record.costCents ? (record.costCents / 100).toString() : '',
        notes: record.notes || ''
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
        eventDate: form.eventDate,
        type: form.type,
        diagnosis: form.diagnosis || undefined,
        treatment: form.treatment || undefined,
        outcome: form.outcome,
        cullReason: form.cullReason || undefined,
        vet: form.vet || undefined,
        costCents: form.costCents ? Math.round(parseFloat(form.costCents) * 100) : undefined,
        notes: form.notes || undefined
      };

      if (editingRecord) {
        await api.updateHealthRecord(editingRecord._id, payload);
        showSuccess('Health record updated successfully');
      } else {
        await api.createHealthRecord(payload);
        showSuccess('Health record created successfully');
      }

      closeDialog();
      loadRecords();
    } catch (error) {
      showError('Failed to save health record: ' + error.message);
    }
  };

  const handleDelete = async (recordId) => {
    if (!confirm('Are you sure you want to delete this health record?')) return;

    try {
      await api.deleteHealthRecord(recordId);
      showSuccess('Health record deleted successfully');
      loadRecords();
    } catch (error) {
      showError('Failed to delete health record: ' + error.message);
    }
  };

  const formatCost = (costCents) => {
    if (!costCents) return '';
    return `$${(costCents / 100).toFixed(2)}`;
  };

  if (loading) {
    return <Typography>Loading health records...</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Health Records</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openDialog()}
          size="small"
        >
          Add Record
        </Button>
      </Box>

      {records.length === 0 ? (
        <Alert severity="info">No health records yet. Add the first one!</Alert>
      ) : (
        <List dense>
          {records.map((record) => (
            <ListItem
              key={record._id}
              divider
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  <IconButton size="small" onClick={() => openDialog(record)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(record._id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={record.type}
                      color={getTypeColor(record.type)}
                      size="small"
                    />
                    <Chip
                      label={record.outcome}
                      color={getOutcomeColor(record.outcome)}
                      size="small"
                      variant="outlined"
                    />
                    <Typography variant="body2">
                      {new Date(record.eventDate).toLocaleDateString()}
                    </Typography>
                    {record.costCents && (
                      <Typography variant="body2" color="text.secondary">
                        {formatCost(record.costCents)}
                      </Typography>
                    )}
                  </Stack>
                }
                secondary={
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {record.diagnosis && (
                      <Typography variant="body2">
                        <strong>Diagnosis:</strong> {record.diagnosis}
                      </Typography>
                    )}
                    {record.treatment && (
                      <Typography variant="body2">
                        <strong>Treatment:</strong> {record.treatment}
                      </Typography>
                    )}
                    {record.vet && (
                      <Typography variant="body2">
                        <strong>Vet:</strong> {record.vet}
                      </Typography>
                    )}
                    {record.notes && (
                      <Typography variant="body2" color="text.secondary">
                        {record.notes}
                      </Typography>
                    )}
                  </Stack>
                }
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRecord ? 'Edit Health Record' : 'Add Health Record'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              fullWidth
              required
            />

            <TextField
              label="Type"
              select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              fullWidth
              required
            >
              {HEALTH_TYPES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Diagnosis"
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <TextField
              label="Treatment"
              value={form.treatment}
              onChange={(e) => setForm({ ...form, treatment: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <TextField
              label="Outcome"
              select
              value={form.outcome}
              onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              fullWidth
            >
              {OUTCOMES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            {form.type === 'cull' && (
              <TextField
                label="Cull Reason"
                value={form.cullReason}
                onChange={(e) => setForm({ ...form, cullReason: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            )}

            <TextField
              label="Veterinarian"
              value={form.vet}
              onChange={(e) => setForm({ ...form, vet: e.target.value })}
              fullWidth
            />

            <TextField
              label="Cost ($)"
              type="number"
              value={form.costCents}
              onChange={(e) => setForm({ ...form, costCents: e.target.value })}
              fullWidth
              inputProps={{ step: '0.01', min: '0' }}
            />

            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingRecord ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}