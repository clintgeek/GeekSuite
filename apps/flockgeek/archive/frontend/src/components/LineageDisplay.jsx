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
  Typography,
  Card,
  CardContent,
  Box,
  Alert,
  Chip,
  Grid,
  IconButton,
  Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import MaleIcon from '@mui/icons-material/Male';
import FemaleIcon from '@mui/icons-material/Female';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import { api } from '../lib/api.js';
import { useNotifications } from './Notifications.jsx';

const BirdCard = ({ bird, label, onEdit }) => {
  if (!bird) {
    return (
      <Card variant="outlined" sx={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {label}: Unknown
        </Typography>
      </Card>
    );
  }

  const getSexIcon = (sex) => {
    if (sex === 'rooster' || sex === 'cockerel') return <MaleIcon color="primary" />;
    if (sex === 'hen' || sex === 'pullet') return <FemaleIcon color="secondary" />;
    return null;
  };

  const getSexColor = (sex) => {
    if (sex === 'rooster' || sex === 'cockerel') return 'primary';
    if (sex === 'hen' || sex === 'pullet') return 'secondary';
    return 'default';
  };

  return (
    <Card variant="outlined" sx={{ minHeight: 100 }}>
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            {onEdit && (
              <IconButton size="small" onClick={() => onEdit(bird)}>
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {getSexIcon(bird.sex)}
            <Box>
              <Typography variant="body2" fontWeight="bold">
                {bird.name || 'Unnamed'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {bird.tagId}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Chip
              label={bird.sex}
              size="small"
              color={getSexColor(bird.sex)}
              variant="outlined"
            />
            <Chip
              label={bird.breed}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

const LineageTree = ({ tree, depth = 0, maxDepth = 3 }) => {
  if (!tree || depth >= maxDepth) return null;

  return (
    <Box sx={{ ml: depth * 2 }}>
      <BirdCard bird={tree.bird} label={`Generation ${depth + 1}`} />

      {(tree.sire || tree.dam) && (
        <Box sx={{ mt: 2, ml: 2 }}>
          <Grid container spacing={2}>
            {tree.sire && (
              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Sire (Father)
                </Typography>
                <LineageTree tree={tree.sire} depth={depth + 1} maxDepth={maxDepth} />
              </Grid>
            )}
            {tree.dam && (
              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Dam (Mother)
                </Typography>
                <LineageTree tree={tree.dam} depth={depth + 1} maxDepth={maxDepth} />
              </Grid>
            )}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default function LineageDisplay({ birdId }) {
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [availableBirds, setAvailableBirds] = useState([]);
  const [parentForm, setParentForm] = useState({
    sireId: '',
    damId: ''
  });
  const { showSuccess, showError } = useNotifications();

  const loadLineage = async () => {
    try {
      setLoading(true);
      const response = await api.getBirdLineage(birdId);
      setLineage(response.lineage);
    } catch (error) {
      showError('Failed to load lineage: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableBirds = async () => {
    try {
      const birds = await api.listBirds({ limit: 100 });
      // Filter out the current bird and only show potential parents
      const potentialParents = birds.filter(bird =>
        bird._id !== birdId &&
        (bird.sex === 'rooster' || bird.sex === 'cockerel' || bird.sex === 'hen' || bird.sex === 'pullet')
      );
      setAvailableBirds(potentialParents);
    } catch (error) {
      showError('Failed to load available birds: ' + error.message);
    }
  };

  useEffect(() => {
    if (birdId) {
      loadLineage();
    }
  }, [birdId]);

  const openEditDialog = () => {
    setParentForm({
      sireId: lineage?.parents?.sire?._id || '',
      damId: lineage?.parents?.dam?._id || ''
    });
    loadAvailableBirds();
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setParentForm({ sireId: '', damId: '' });
  };

  const handleSaveParents = async () => {
    try {
      await api.setBirdParents(birdId, {
        sireId: parentForm.sireId || null,
        damId: parentForm.damId || null
      });
      showSuccess('Parents updated successfully');
      closeEditDialog();
      loadLineage();
    } catch (error) {
      showError('Failed to update parents: ' + error.message);
    }
  };

  if (loading) {
    return <Typography>Loading lineage...</Typography>;
  }

  if (!lineage) {
    return <Alert severity="error">Failed to load lineage data</Alert>;
  }

  const roosters = availableBirds.filter(bird => bird.sex === 'rooster' || bird.sex === 'cockerel');
  const hens = availableBirds.filter(bird => bird.sex === 'hen' || bird.sex === 'pullet');

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FamilyRestroomIcon />
          Family Tree
        </Typography>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={openEditDialog}
          size="small"
        >
          Edit Parents
        </Button>
      </Box>

      {/* Current Bird */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Current Bird
          </Typography>
          <BirdCard bird={lineage.bird} label="Subject" />
        </CardContent>
      </Card>

      {/* Immediate Parents */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Parents
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <BirdCard
                bird={lineage.parents.sire}
                label="Sire (Father)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <BirdCard
                bird={lineage.parents.dam}
                label="Dam (Mother)"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Full Lineage Tree */}
      {lineage.fullTree && (lineage.fullTree.sire || lineage.fullTree.dam) && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Extended Family Tree
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {lineage.fullTree.sire && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" color="primary" gutterBottom>
                  Paternal Line
                </Typography>
                <LineageTree tree={lineage.fullTree.sire} />
              </Box>
            )}

            {lineage.fullTree.dam && (
              <Box>
                <Typography variant="h6" color="secondary" gutterBottom>
                  Maternal Line
                </Typography>
                <LineageTree tree={lineage.fullTree.dam} />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* No lineage message */}
      {!lineage.parents.sire && !lineage.parents.dam && (
        <Alert severity="info">
          No parent information recorded yet. Click "Edit Parents" to add lineage data.
        </Alert>
      )}

      {/* Edit Parents Dialog */}
      <Dialog open={editDialogOpen} onClose={closeEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Parents</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Sire (Father)"
              select
              value={parentForm.sireId}
              onChange={(e) => setParentForm({ ...parentForm, sireId: e.target.value })}
              fullWidth
              helperText="Select the rooster that is the father"
            >
              <MenuItem value="">— No Sire —</MenuItem>
              {roosters.map((bird) => (
                <MenuItem key={bird._id} value={bird._id}>
                  {bird.name || 'Unnamed'} ({bird.tagId}) - {bird.breed}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Dam (Mother)"
              select
              value={parentForm.damId}
              onChange={(e) => setParentForm({ ...parentForm, damId: e.target.value })}
              fullWidth
              helperText="Select the hen that is the mother"
            >
              <MenuItem value="">— No Dam —</MenuItem>
              {hens.map((bird) => (
                <MenuItem key={bird._id} value={bird._id}>
                  {bird.name || 'Unnamed'} ({bird.tagId}) - {bird.breed}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog}>Cancel</Button>
          <Button onClick={handleSaveParents} variant="contained">
            Save Parents
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}