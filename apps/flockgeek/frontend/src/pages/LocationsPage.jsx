import React, { useState, useEffect } from "react";
import {
  Container,
  Paper,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Stack
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import client from "../services/apiClient";

const LocationsPage = () => {
  const [locations, setLocations] = useState([]);
  const [birdsByLocation, setBirdsByLocation] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    type: "",
    q: ""
  });
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    type: "",
    capacity: "",
    description: "",
    notes: ""
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: "",
    type: "",
    capacity: "",
    description: "",
    notes: ""
  });

  const fetchLocations = async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        sortBy: "name",
        sortOrder: "asc",
        limit: 100,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      };

      const response = await client.get("/locations", { params });
      const locs = response.data.data.locations;
      setLocations(locs);

      // Fetch birds for all locations
      const birdsResponse = await client.get("/birds", { params: { limit: 1000 } });
      const allBirds = birdsResponse.data.data?.birds || birdsResponse.data.birds || [];

      // Group birds by locationId - normalize IDs to strings for comparison
      const grouped = {};
      for (const loc of locs) {
        const locId = loc._id?.toString?.() || loc._id;
        grouped[locId] = [];
      }
      for (const bird of allBirds) {
        // locationId might be an object (populated) or string
        const birdLocId = bird.locationId?._id?.toString?.()
          || bird.locationId?.toString?.()
          || bird.locationId;
        if (birdLocId && grouped[birdLocId]) {
          grouped[birdLocId].push(bird);
        }
      }
      setBirdsByLocation(grouped);
    } catch (err) {
      setError(err.message || "Failed to fetch locations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [filters]);

  const handleDeleteLocation = async (id) => {
    if (!window.confirm("Delete this location?")) return;

    try {
      await client.delete(`/locations/${id}`);
      fetchLocations();
    } catch (err) {
      setError(err.message || "Failed to delete location");
    }
  };

  const handleEditLocation = (location, e) => {
    e.stopPropagation();
    setEditingLocation(location);
    setEditFormData({
      name: location.name || "",
      type: location.type || "",
      capacity: location.capacity || "",
      description: location.description || "",
      notes: location.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingLocation(null);
    setEditFormData({
      name: "",
      type: "",
      capacity: "",
      description: "",
      notes: ""
    });
  };

  const handleSaveEdit = async () => {
    try {
      const dataToSend = {
        ...editFormData,
        capacity: editFormData.capacity ? parseInt(editFormData.capacity) : null
      };

      await client.put(`/locations/${editingLocation._id}`, dataToSend);
      setEditDialogOpen(false);
      fetchLocations();
    } catch (err) {
      setError(err.message || "Failed to update location");
    }
  };

  const handleAddLocation = () => {
    setAddFormData({
      name: "",
      type: "",
      capacity: "",
      description: "",
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      name: "",
      type: "",
      capacity: "",
      description: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    try {
      const dataToSend = {
        ...addFormData,
        capacity: addFormData.capacity ? parseInt(addFormData.capacity) : null
      };

      await client.post("/locations", dataToSend);
      setAddDialogOpen(false);
      fetchLocations();
    } catch (err) {
      setError(err.message || "Failed to create location");
    }
  };

  const handleAccordionChange = (locationId) => (event, isExpanded) => {
    setExpandedLocation(isExpanded ? locationId : null);
  };

  const typeOptions = ["tractor", "coop", "breeding_pen", "brooder", "other"];

  const getTypeLabel = (type) => {
    return type ? type.replace(/_/g, " ") : "Unknown";
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "tractor":
        return "primary";
      case "coop":
        return "info";
      case "breeding_pen":
        return "success";
      case "brooder":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <div></div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddLocation}
        >
          Add Location
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField
            label="Search"
            size="small"
            placeholder="Location name"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
            }}
          />

          <TextField
            select
            label="Type"
            size="small"
            value={filters.type}
            onChange={(e) => {
              setFilters({ ...filters, type: e.target.value });
            }}
          >
            <MenuItem value="">All Types</MenuItem>
            {typeOptions.map((t) => (
              <MenuItem key={t} value={t}>
                {getTypeLabel(t)}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {/* Locations Accordion List */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : locations.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No locations found</Typography>
        </Paper>
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          {locations.map((location, index) => {
            const locId = location._id?.toString?.() || location._id;
            const birds = birdsByLocation[locId] || [];
            const population = birds.length;
            const capacity = location.capacity || 0;

            return (
              <Accordion
                key={location._id}
                expanded={expandedLocation === location._id}
                onChange={handleAccordionChange(location._id)}
                disableGutters
                elevation={0}
                square
                sx={{
                  '&:before': { display: 'none' },
                  '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' }
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 0,
                      my: 0
                    }
                  }}
                >
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 80px auto',
                    alignItems: 'center',
                    width: '100%',
                    gap: 2,
                    pr: 1
                  }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {location.name}
                    </Typography>
                    <Chip
                      label={getTypeLabel(location.type)}
                      color={getTypeColor(location.type)}
                      size="small"
                      sx={{ justifySelf: 'start' }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: capacity && population > capacity ? 'error.main' : 'text.secondary',
                        textAlign: 'right'
                      }}
                    >
                      {capacity ? `${population} / ${capacity}` : population}
                    </Typography>
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleEditLocation(location, e)}
                        color="primary"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLocation(location._id);
                        }}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {location.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {location.description}
                    </Typography>
                  )}
                  {birds.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No birds in this location
                    </Typography>
                  ) : (
                    <List dense disablePadding>
                      {birds.map((bird) => (
                        <ListItem key={bird._id} disableGutters>
                          <ListItemText
                            primary={bird.name || bird.tagId || `Bird ${bird._id.slice(-6)}`}
                            secondary={[bird.species, bird.breed, bird.sex].filter(Boolean).join(' • ')}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                  {location.notes && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                      Notes: {location.notes}
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Paper>
      )}

      {/* Edit Location Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Location</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={editFormData.type}
                label="Type"
                onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
              >
                {typeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {getTypeLabel(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Capacity"
              type="number"
              value={editFormData.capacity}
              onChange={(e) => setEditFormData({ ...editFormData, capacity: e.target.value })}
              fullWidth
            />
            <TextField
              label="Description"
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Notes"
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Location Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Location</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name *"
              value={addFormData.name}
              onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={addFormData.type}
                label="Type"
                onChange={(e) => setAddFormData({ ...addFormData, type: e.target.value })}
              >
                {typeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {getTypeLabel(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Capacity"
              type="number"
              value={addFormData.capacity}
              onChange={(e) => setAddFormData({ ...addFormData, capacity: e.target.value })}
              fullWidth
            />
            <TextField
              label="Description"
              value={addFormData.description}
              onChange={(e) => setAddFormData({ ...addFormData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Notes"
              value={addFormData.notes}
              onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>Cancel</Button>
          <Button
            onClick={handleSaveAdd}
            variant="contained"
            disabled={!addFormData.name}
          >
            Add Location
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LocationsPage;
