import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import {
  Container, Paper, Button, Box, Typography, CircularProgress, Alert,
  TextField, MenuItem, Chip, FormControl, InputLabel, Select, Accordion,
  AccordionSummary, AccordionDetails, List, ListItem, ListItemText,
  IconButton, Stack
} from "@mui/material";
import LedgerDialog from "../components/primitives/LedgerDialog";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { GET_LOCATIONS, GET_BIRDS } from "../graphql/queries";
import { CREATE_FLOCK_LOCATION, UPDATE_FLOCK_LOCATION, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { name: "", type: "", capacity: "", description: "", notes: "" };
const typeOptions = ["tractor", "coop", "breeding_pen", "brooder", "other"];
const getTypeLabel = (type) => type ? type.replace(/_/g, " ") : "Unknown";
const getTypeColor = (type) => ({ tractor: "primary", coop: "info", breeding_pen: "success", brooder: "warning" }[type] ?? "default");

const LocationsPage = () => {
  const [filters, setFilters] = useState({ type: "", q: "" });
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [mutationError, setMutationError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(emptyForm);

  const { data: locData, loading, error } = useQuery(GET_LOCATIONS);
  const { data: birdsData } = useQuery(GET_BIRDS);

  const allLocations = locData?.flockLocations || [];
  const allBirds = birdsData?.birds || [];

  const refetchList = ['GetFlockLocations'];

  const [createFlockLocation] = useMutation(CREATE_FLOCK_LOCATION, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData(emptyForm); },
    onError: (err) => setMutationError(err.message),
  });

  const [updateFlockLocation] = useMutation(UPDATE_FLOCK_LOCATION, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setEditDialogOpen(false); setEditingLocation(null); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const locations = useMemo(() => allLocations.filter(loc => {
    if (filters.type && loc.type !== filters.type) return false;
    if (filters.q && !loc.name?.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  }), [allLocations, filters]);

  const birdsByLocation = useMemo(() => {
    const grouped = {};
    for (const loc of allLocations) grouped[loc.id] = [];
    for (const bird of allBirds) {
      if (bird.locationId && grouped[bird.locationId]) {
        grouped[bird.locationId].push(bird);
      }
    }
    return grouped;
  }, [allLocations, allBirds]);

  const handleDelete = (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this location?")) return;
    deleteEntity({ variables: { type: "location", id } });
  };

  const handleEdit = (location, e) => {
    e.stopPropagation();
    setEditingLocation(location);
    setEditFormData({
      name: location.name || "",
      type: location.type || "",
      capacity: location.capacity || "",
      description: location.description || "",
      notes: location.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editFormData.name) { setMutationError("Name is required"); return; }
    updateFlockLocation({ variables: {
      id: editingLocation.id,
      name: editFormData.name,
      type: editFormData.type || undefined,
      capacity: editFormData.capacity ? parseInt(editFormData.capacity) : undefined,
      description: editFormData.description || undefined,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.name || !addFormData.type) { setMutationError("Name and type are required"); return; }
    createFlockLocation({ variables: {
      name: addFormData.name,
      type: addFormData.type,
      capacity: addFormData.capacity ? parseInt(addFormData.capacity) : undefined,
      description: addFormData.description || undefined,
      notes: addFormData.notes || undefined,
    }});
  };

  const formFields = (formData, setForm) => (
    <>
      <TextField label="Name" required fullWidth value={formData.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
      <FormControl fullWidth>
        <InputLabel>Type</InputLabel>
        <Select value={formData.type} label="Type" onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))}>
          {typeOptions.map((t) => <MenuItem key={t} value={t}>{getTypeLabel(t)}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField label="Capacity" type="number" fullWidth value={formData.capacity} onChange={(e) => setForm(p => ({ ...p, capacity: e.target.value }))} />
      <TextField label="Description" fullWidth multiline rows={2} value={formData.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
      <TextField label="Notes" fullWidth multiline rows={2} value={formData.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
    </>
  );

  return (
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 0, md: 4 }, px: { xs: 0, md: 2 } }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData(emptyForm); setAddDialogOpen(true); }}>
          Add Location
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField label="Search" size="small" placeholder="Location name" value={filters.q}
            onChange={(e) => setFilters(p => ({ ...p, q: e.target.value }))} />
          <TextField select label="Type" size="small" value={filters.type}
            onChange={(e) => setFilters(p => ({ ...p, type: e.target.value }))}>
            <MenuItem value="">All Types</MenuItem>
            {typeOptions.map((t) => <MenuItem key={t} value={t}>{getTypeLabel(t)}</MenuItem>)}
          </TextField>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>
      ) : locations.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">No locations found</Typography></Paper>
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          {locations.map((location) => {
            const birds = birdsByLocation[location.id] || [];
            const capacity = location.capacity || 0;
            return (
              <Accordion key={location.id} expanded={expandedLocation === location.id}
                onChange={(_, isExpanded) => setExpandedLocation(isExpanded ? location.id : null)}
                disableGutters elevation={0} square
                sx={{ '&:before': { display: 'none' }, '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}
                  sx={{ '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 0, my: 0 } }}>
                  {/* Four fixed tracks squeeze at 390px; below `md` the name
                      takes its own line and the actions get their 44px. */}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr auto', md: '1fr 100px 80px auto' },
                    alignItems: 'center', width: '100%', gap: { xs: 1, md: 2 }, pr: 1
                  }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, gridColumn: { xs: '1 / -1', md: 'auto' } }}>{location.name}</Typography>
                    <Chip label={getTypeLabel(location.type)} color={getTypeColor(location.type)} size="small" sx={{ justifySelf: 'start' }} />
                    <Typography variant="body2" sx={{ fontWeight: 500, color: capacity && birds.length > capacity ? 'error.main' : 'text.secondary', textAlign: { xs: 'left', md: 'right' }, justifySelf: { xs: 'end', md: 'stretch' }, gridColumn: { xs: '2', md: 'auto' } }}>
                      {capacity ? `${birds.length} / ${capacity}` : birds.length}
                    </Typography>
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()} sx={{ justifySelf: 'end', gridColumn: { xs: '1 / -1', md: 'auto' } }}>
                      <IconButton aria-label={`Edit ${location.name}`} onClick={(e) => handleEdit(location, e)} color="primary" sx={{ width: 44, height: 44 }}><EditIcon fontSize="small" /></IconButton>
                      <IconButton aria-label={`Delete ${location.name}`} onClick={(e) => handleDelete(location.id, e)} color="error" sx={{ width: 44, height: 44 }}><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {location.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{location.description}</Typography>}
                  {birds.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No birds in this location</Typography>
                  ) : (
                    <List dense disablePadding>
                      {birds.map((bird) => (
                        <ListItem key={bird.id} disableGutters>
                          <ListItemText
                            primary={bird.name || bird.tagId || `Bird ${bird.id.slice(-6)}`}
                            secondary={[bird.species, bird.breed, bird.sex].filter(Boolean).join(' • ')}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                  {location.notes && <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>Notes: {location.notes}</Typography>}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Paper>
      )}

      {/* Edit / Add — full-screen below `sm`; the header's save button submits
          the body's form by id. */}
      <LedgerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit location"
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="location-edit-form" variant="contained">Save</Button>}
      >
        <Box
          component="form"
          id="location-edit-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {formFields(editFormData, setEditFormData)}
        </Box>
      </LedgerDialog>

      <LedgerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add new location"
        secondaryAction={<Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>}
        primaryAction={
          <Button type="submit" form="location-add-form" variant="contained" disabled={!addFormData.name}>Add Location</Button>
        }
      >
        <Box
          component="form"
          id="location-add-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveAdd(); }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {formFields(addFormData, setAddFormData)}
        </Box>
      </LedgerDialog>

    </Container>
  );
};

export default LocationsPage;
