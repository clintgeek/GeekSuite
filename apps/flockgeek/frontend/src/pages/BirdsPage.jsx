import React, { useState, useEffect, Fragment } from "react";
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Toolbar,
  Chip,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import client from "../services/apiClient";
import { toLocalDateString } from "../utils/dateUtils";

const BirdsPage = () => {
  const [birds, setBirds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("tagId");
  const [sortOrder, setSortOrder] = useState("asc");
  const [filters, setFilters] = useState({
    status: "",
    sex: "",
    breed: "",
    q: ""
  });
  const [allBreeds, setAllBreeds] = useState([]);
  const [expandedBirdId, setExpandedBirdId] = useState(null); // State to manage expanded accordion
  const [editingBird, setEditingBird] = useState(null);
  const [birdGroups, setBirdGroups] = useState({}); // Store group memberships for birds
  const [locations, setLocations] = useState([]); // Store available locations for dropdown

  const formatDateForInput = (value) => {
    if (!value) return "";
    const str = toLocalDateString(value);
    return str || "";
  };

  const emptyEditForm = {
    tagId: "",
    name: "",
    sex: "",
    breed: "",
    hatchDate: "",
    status: "",
    species: "",
    strain: "",
    cross: "false",
    origin: "",
    foundationStock: "false",
    sireId: "",
    damId: "",
    locationId: "",
    temperamentScore: "",
    statusDate: "",
    statusReason: "",
    notes: ""
  };

  const buildEditFormData = (bird) => {
    if (!bird) return { ...emptyEditForm };

    return {
      tagId: bird.tagId || "",
      name: bird.name || "",
      sex: bird.sex || "",
      breed: bird.breed || "",
      hatchDate: formatDateForInput(bird.hatchDate),
      status: bird.status || "",
      species: bird.species || "",
      strain: bird.strain || "",
      cross: bird.cross ? "true" : "false",
      origin: bird.origin || "",
      foundationStock: bird.foundationStock ? "true" : "false",
      sireId: bird.sireId?._id || bird.sireId || "",
      damId: bird.damId?._id || bird.damId || "",
      locationId: bird.locationId?._id || bird.locationId || "",
      temperamentScore: bird.temperamentScore ?? "",
      statusDate: formatDateForInput(bird.statusDate),
      statusReason: bird.statusReason || "",
      notes: bird.notes || ""
    };
  };

  const [editFormData, setEditFormData] = useState(() => buildEditFormData(null));
  const resetEditFormData = (bird = null) => setEditFormData(buildEditFormData(bird));
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    tagId: "",
    name: "",
    sex: "",
    breed: "",
    hatchDate: "",
    status: "active",
    species: "chicken",
    strain: "",
    cross: false,
    origin: "unknown",
    foundationStock: false,
    sireId: null,
    damId: null,
    locationId: null,
    temperamentScore: "",
    statusDate: "",
    statusReason: "",
    notes: ""
  });

  const fetchBirdGroups = async (birdIds) => {
    try {
      // Fetch groups for each bird using the new endpoint
      const groupPromises = birdIds.map(async (birdId) => {
        const response = await client.get(`/groups/bird/${birdId}`);
        return { birdId, groups: response.data.data.groups || [] };
      });

      const results = await Promise.all(groupPromises);
      const groupsMap = {};
      results.forEach(({ birdId, groups }) => {
        groupsMap[birdId] = groups;
      });

      setBirdGroups(groupsMap);
    } catch (err) {
      console.error("Failed to fetch bird groups:", err);
    }
  };

  const fetchBirds = async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        sortBy,
        sortOrder,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      };

      const response = await client.get("/birds", { params });
      setBirds(response.data.data.birds);
      setTotal(response.data.data.pagination.total);

      // Fetch group memberships for the birds
      if (response.data.data.birds.length > 0) {
        const birdIds = response.data.data.birds.map(bird => bird._id);
        fetchBirdGroups(birdIds);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch birds");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllBreeds = async () => {
    try {
      // Fetch all birds without pagination to get unique breeds
      const response = await client.get("/birds", {
        params: {
          limit: 1000, // Large limit to get all breeds
          sortBy: "breed",
          sortOrder: "asc"
        }
      });

      // Extract unique breeds, filter out null/empty values
      const breeds = [...new Set(
        response.data.data.birds
          .map(bird => bird.breed)
          .filter(breed => breed && breed.trim() !== "")
      )].sort();

      setAllBreeds(breeds);
    } catch (err) {
      console.error("Failed to fetch breeds:", err);
    }
  };

  useEffect(() => {
    fetchBirds();
  }, [page, rowsPerPage, filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchAllBreeds();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await client.get("/locations");
      setLocations(response.data.data.locations);
    } catch (err) {
      console.error("Failed to fetch locations:", err);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleDeleteBird = async (id) => {
    if (!window.confirm("Delete this bird?")) return;

    try {
      await client.delete(`/birds/${id}`);
      fetchBirds();
      fetchAllBreeds(); // Refresh breeds in case this was the only bird of that breed
    } catch (err) {
      setError(err.message || "Failed to delete bird");
    }
  };

  const handleAccordionChange = (birdId) => (event, isExpanded) => {
    if (isExpanded) {
      const birdToEdit = birds.find((bird) => bird._id === birdId);
      setEditingBird(birdToEdit || null);
      setEditFormData(buildEditFormData(birdToEdit));
      setExpandedBirdId(birdId);
    } else {
      setExpandedBirdId(null);
      setEditingBird(null);
      resetEditFormData();
    }
  };

  const handleCancelEdit = () => {
    setExpandedBirdId(null);
    setEditingBird(null);
    resetEditFormData();
  };

  const handleSaveEdit = async () => {
    try {
      const dataToSend = {
        ...editFormData,
        cross: editFormData.cross === "true",
        foundationStock: editFormData.foundationStock === "true",
        temperamentScore: editFormData.temperamentScore === "" ? null : Number(editFormData.temperamentScore),
        hatchDate: editFormData.hatchDate ? new Date(editFormData.hatchDate).toISOString() : null,
        statusDate: editFormData.statusDate ? new Date(editFormData.statusDate).toISOString() : null
      };

      await client.put(`/birds/${editingBird._id}`, dataToSend);
      handleCancelEdit();
      fetchBirds();
      fetchAllBreeds(); // Refresh breeds in case breed changed
    } catch (err) {
      setError(err.message || "Failed to update bird");
    }
  };

  const handleAddBird = () => {
    setAddFormData({
      tagId: "",
      name: "",
      sex: "",
      breed: "",
      hatchDate: "",
      status: "active",
      species: "chicken",
      strain: "",
      cross: false,
      origin: "unknown",
      foundationStock: false,
      sireId: null,
      damId: null,
      locationId: null,
      temperamentScore: "",
      statusDate: "",
      statusReason: "",
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      tagId: "",
      name: "",
      sex: "",
      breed: "",
      hatchDate: "",
      status: "active",
      species: "chicken",
      strain: "",
      cross: false,
      origin: "unknown",
      foundationStock: false,
      sireId: null,
      damId: null,
      locationId: null,
      temperamentScore: "",
      statusDate: "",
      statusReason: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    try {
      const dataToSend = {
        ...addFormData,
        hatchDate: addFormData.hatchDate ? new Date(addFormData.hatchDate).toISOString() : null,
        statusDate: addFormData.statusDate ? new Date(addFormData.statusDate).toISOString() : null
      };

      await client.post("/birds", dataToSend);
      setAddDialogOpen(false);
      fetchBirds();
      fetchAllBreeds(); // Refresh breeds in case new breed was added
    } catch (err) {
      setError(err.message || "Failed to create bird");
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (column) => {
    const isAsc = sortBy === column && sortOrder === "asc";
    setSortOrder(isAsc ? "desc" : "asc");
    setSortBy(column);
    setPage(0);
  };

  const statusOptions = ["active", "meat run", "retired"];
  const sexOptions = ["pullet", "hen", "cockerel", "rooster", "unknown"];
  const speciesOptions = ["chicken", "duck", "turkey", "quail", "other"];
  const originOptions = ["own_egg", "purchased", "traded", "rescued", "unknown"];

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "success";
      case "meat run":
        return "warning";
      case "retired":
        return "default";
      default:
        return "default";
    }
  };

  const getAgeText = (dateValue) => {
    if (!dateValue) return "Unknown";
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return "Unknown";

    const now = new Date();
    if (parsed > now) return "Unknown";

    const diffMs = now - parsed;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365.25);

    if (years >= 1) {
      const remainingDays = Math.max(diffDays - Math.floor(years * 365.25), 0);
      const months = Math.floor(remainingDays / 30.44);
      return months > 0 ? `${years}y ${months}m` : `${years}y`;
    }

    const months = Math.floor(diffDays / 30.44);
    if (months >= 1) {
      const remainingDays = Math.max(diffDays - Math.floor(months * 30.44), 0);
      return remainingDays > 0 ? `${months}m ${remainingDays}d` : `${months}m`;
    }

    return `${diffDays}d`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <div></div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddBird}
        >
          Add Bird
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField
            label="Search"
            size="small"
            placeholder="Name or Tag ID"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(0);
            }}
          />

          <TextField
            select
            label="Status"
            size="small"
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(0);
            }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {statusOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Sex"
            size="small"
            value={filters.sex}
            onChange={(e) => {
              setFilters({ ...filters, sex: e.target.value });
              setPage(0);
            }}
          >
            <MenuItem value="">All Sexes</MenuItem>
            {sexOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Breed"
            size="small"
            value={filters.breed}
            onChange={(e) => {
              setFilters({ ...filters, breed: e.target.value });
              setPage(0);
            }}
          >
            <MenuItem value="">All Breeds</MenuItem>
            {allBreeds.map((breed) => (
              <MenuItem key={breed} value={breed}>
                {breed}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "tagId"}
                      direction={sortBy === "tagId" ? sortOrder : "asc"}
                      onClick={() => handleSort("tagId")}
                    >
                      Tag ID
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "name"}
                      direction={sortBy === "name" ? sortOrder : "asc"}
                      onClick={() => handleSort("name")}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "sex"}
                      direction={sortBy === "sex" ? sortOrder : "asc"}
                      onClick={() => handleSort("sex")}
                    >
                      Sex
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "breed"}
                      direction={sortBy === "breed" ? sortOrder : "asc"}
                      onClick={() => handleSort("breed")}
                    >
                      Breed
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "hatchDate"}
                      direction={sortBy === "hatchDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("hatchDate")}
                    >
                      Hatch Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "status"}
                      direction={sortBy === "status" ? sortOrder : "asc"}
                      onClick={() => handleSort("status")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {birds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      No birds found
                    </TableCell>
                  </TableRow>
                ) : (
                  birds.map((bird) => {
                    const isExpanded = expandedBirdId === bird._id;

                    return (
                      <TableRow key={bird._id} hover sx={{ cursor: 'pointer' }}>
                        <TableCell colSpan={7} sx={{ p: 0 }}>
                          <Accordion
                            expanded={isExpanded}
                            onChange={handleAccordionChange(bird._id)}
                            sx={{ '&.Mui-expanded': { margin: 0 } }}
                          >
                            <AccordionSummary
                              expandIcon={<ExpandMoreIcon />}
                              aria-controls={`panel-${bird._id}-content`}
                              id={`panel-${bird._id}-header`}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2, gap: 2 }}>
                                <Box sx={{ minWidth: 80, flexShrink: 0 }}>
                                  {isExpanded ? (
                                    <TextField
                                      label="Tag ID"
                                      size="small"
                                      value={editFormData.tagId}
                                      onChange={(e) => setEditFormData({ ...editFormData, tagId: e.target.value })}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <Typography variant="subtitle1">
                                      <strong>{bird.tagId}</strong>
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ flexGrow: 1, minWidth: 160 }}>
                                  {isExpanded ? (
                                    <TextField
                                      label="Name"
                                      size="small"
                                      value={editFormData.name}
                                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <Typography variant="body1">
                                      {bird.name || "-"}
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ minWidth: 140 }}>
                                  {isExpanded ? (
                                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                                      <InputLabel>Sex</InputLabel>
                                      <Select
                                        value={editFormData.sex}
                                        label="Sex"
                                        onChange={(e) => setEditFormData({ ...editFormData, sex: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {sexOptions.map((sex) => (
                                          <MenuItem key={sex} value={sex}>
                                            {sex.charAt(0).toUpperCase() + sex.slice(1)}
                                          </MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                  ) : (
                                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                      {bird.sex}
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ minWidth: 180 }}>
                                  {isExpanded ? (
                                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                                      <InputLabel>Breed</InputLabel>
                                      <Select
                                        value={editFormData.breed}
                                        label="Breed"
                                        onChange={(e) => setEditFormData({ ...editFormData, breed: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MenuItem value="">
                                          <em>None</em>
                                        </MenuItem>
                                        {allBreeds.map((breedOption) => (
                                          <MenuItem key={breedOption} value={breedOption}>
                                            {breedOption}
                                          </MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                  ) : (
                                    <Typography variant="body2">
                                      {bird.breed || "-"}
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ minWidth: 160 }}>
                                  {isExpanded ? (
                                    <TextField
                                      label="Hatch Date"
                                      type="date"
                                      size="small"
                                      value={editFormData.hatchDate}
                                      onChange={(e) => setEditFormData({ ...editFormData, hatchDate: e.target.value })}
                                      InputLabelProps={{ shrink: true }}
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <Typography variant="body2">
                                      {bird.hatchDate ? new Date(bird.hatchDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-"}
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center' }}>
                                  {isExpanded ? (
                                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                                      <InputLabel>Status</InputLabel>
                                      <Select
                                        value={editFormData.status}
                                        label="Status"
                                        onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {statusOptions.map((status) => (
                                          <MenuItem key={status} value={status}>
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                          </MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                  ) : (
                                    <Chip
                                      label={bird.status}
                                      color={getStatusColor(bird.status)}
                                      size="small"
                                      sx={{ flexShrink: 0 }}
                                    />
                                  )}
                                </Box>
                              </Box>
                            </AccordionSummary>
                          <AccordionDetails>
                            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {/* Bird Details */}
                              <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>Bird Details</Typography>
                                <Grid container spacing={2}>
                                  <Grid item xs={12} sm={6} md={4}>
                                    <Typography variant="subtitle2" color="text.secondary">Age</Typography>
                                    <Typography variant="body1">
                                      {getAgeText(isExpanded ? editFormData.hatchDate : bird.hatchDate)}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <FormControl fullWidth size="small">
                                        <InputLabel>Species</InputLabel>
                                        <Select
                                          value={editFormData.species}
                                          label="Species"
                                          onChange={(e) => setEditFormData({ ...editFormData, species: e.target.value })}
                                        >
                                          {speciesOptions.map((species) => (
                                            <MenuItem key={species} value={species}>
                                              {species.charAt(0).toUpperCase() + species.slice(1)}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Species</Typography>
                                        <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                                          {bird.species || '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Strain"
                                        size="small"
                                        value={editFormData.strain}
                                        onChange={(e) => setEditFormData({ ...editFormData, strain: e.target.value })}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Strain</Typography>
                                        <Typography variant="body1">
                                          {bird.strain || '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <FormControl fullWidth size="small">
                                        <InputLabel>Cross</InputLabel>
                                        <Select
                                          value={editFormData.cross}
                                          label="Cross"
                                          onChange={(e) => setEditFormData({ ...editFormData, cross: e.target.value })}
                                        >
                                          <MenuItem value="true">Yes</MenuItem>
                                          <MenuItem value="false">No</MenuItem>
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Cross</Typography>
                                        <Typography variant="body1">
                                          {bird.cross ? 'Yes' : 'No'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <FormControl fullWidth size="small">
                                        <InputLabel>Origin</InputLabel>
                                        <Select
                                          value={editFormData.origin}
                                          label="Origin"
                                          onChange={(e) => setEditFormData({ ...editFormData, origin: e.target.value })}
                                        >
                                          {originOptions.map((origin) => (
                                            <MenuItem key={origin} value={origin}>
                                              {origin.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Origin</Typography>
                                        <Typography variant="body1">
                                          {bird.origin ? bird.origin.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <FormControl fullWidth size="small">
                                        <InputLabel>Foundation Stock</InputLabel>
                                        <Select
                                          value={editFormData.foundationStock}
                                          label="Foundation Stock"
                                          onChange={(e) => setEditFormData({ ...editFormData, foundationStock: e.target.value })}
                                        >
                                          <MenuItem value="true">Yes</MenuItem>
                                          <MenuItem value="false">No</MenuItem>
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Foundation Stock</Typography>
                                        <Typography variant="body1">
                                          {bird.foundationStock ? 'Yes' : 'No'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <FormControl fullWidth size="small">
                                        <InputLabel>Location</InputLabel>
                                        <Select
                                          value={editFormData.locationId}
                                          label="Location"
                                          onChange={(e) => setEditFormData({ ...editFormData, locationId: e.target.value })}
                                        >
                                          <MenuItem value="">
                                            <em>Unassigned</em>
                                          </MenuItem>
                                          {locations.map((location) => (
                                            <MenuItem key={location._id} value={location._id}>
                                              {location.name}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Location</Typography>
                                        <Typography variant="body1">
                                          {bird.locationId?.name || 'Unassigned'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={4}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Temperament Score"
                                        size="small"
                                        type="number"
                                        value={editFormData.temperamentScore}
                                        onChange={(e) => setEditFormData({ ...editFormData, temperamentScore: e.target.value })}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Temperament</Typography>
                                        <Typography variant="body1">
                                          {bird.temperamentScore ?? '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                </Grid>
                              </Box>

                              {/* Lineage */}
                              <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>Lineage</Typography>
                                <Grid container spacing={2}>
                                  <Grid item xs={12} sm={6}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Sire ID"
                                        size="small"
                                        value={editFormData.sireId}
                                        onChange={(e) => setEditFormData({ ...editFormData, sireId: e.target.value })}
                                        placeholder={bird.sireId ? `${bird.sireId.name} (${bird.sireId.tagId})` : undefined}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Sire</Typography>
                                        <Typography variant="body1">
                                          {bird.sireId ? `${bird.sireId.name} (${bird.sireId.tagId})` : '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Dam ID"
                                        size="small"
                                        value={editFormData.damId}
                                        onChange={(e) => setEditFormData({ ...editFormData, damId: e.target.value })}
                                        placeholder={bird.damId ? `${bird.damId.name} (${bird.damId.tagId})` : undefined}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Dam</Typography>
                                        <Typography variant="body1">
                                          {bird.damId ? `${bird.damId.name} (${bird.damId.tagId})` : '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                </Grid>
                              </Box>

                              {/* Group Memberships */}
                              <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>Group Memberships</Typography>
                                <Box>
                                  {birdGroups[bird._id] && birdGroups[bird._id].length > 0 ? (
                                    birdGroups[bird._id].map((group) => (
                                      <Chip
                                        key={group._id}
                                        label={`${group.name || 'Unknown Group'} (${group.purpose || 'Unknown Purpose'})`}
                                        variant="outlined"
                                        size="small"
                                        sx={{ mr: 1, mb: 1 }}
                                      />
                                    ))
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      No group memberships
                                    </Typography>
                                  )}
                                </Box>
                              </Box>

                              {/* Status Details */}
                              <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>Status Details</Typography>
                                <Grid container spacing={2}>
                                  <Grid item xs={12} sm={6}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Status Date"
                                        type="date"
                                        size="small"
                                        value={editFormData.statusDate}
                                        onChange={(e) => setEditFormData({ ...editFormData, statusDate: e.target.value })}
                                        InputLabelProps={{ shrink: true }}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Status Date</Typography>
                                        <Typography variant="body1">
                                          {bird.statusDate ? new Date(bird.statusDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={6}>
                                    {isExpanded ? (
                                      <TextField
                                        fullWidth
                                        label="Status Reason"
                                        size="small"
                                        value={editFormData.statusReason}
                                        onChange={(e) => setEditFormData({ ...editFormData, statusReason: e.target.value })}
                                      />
                                    ) : (
                                      <>
                                        <Typography variant="subtitle2" color="text.secondary">Status Reason</Typography>
                                        <Typography variant="body1">
                                          {bird.statusReason || '-'}
                                        </Typography>
                                      </>
                                    )}
                                  </Grid>
                                </Grid>
                              </Box>

                              {/* Notes */}
                              <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>Notes</Typography>
                                {isExpanded ? (
                                  <TextField
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    value={editFormData.notes}
                                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                                  />
                                ) : (
                                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {bird.notes || '-'}
                                  </Typography>
                                )}
                              </Box>

                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                <Button
                                  onClick={() => {
                                    handleDeleteBird(editingBird._id);
                                    handleCancelEdit();
                                  }}
                                  color="error"
                                  startIcon={<DeleteIcon />}
                                >
                                  Delete
                                </Button>
                                <Button onClick={handleCancelEdit}>Cancel</Button>
                                <Button onClick={handleSaveEdit} variant="contained">Save</Button>
                              </Box>
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      </TableCell>
                    </TableRow>
                  );
                })
                )}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </TableContainer>

      {/* Add Bird Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="md" fullWidth>
        <DialogTitle>Add New Bird</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Tag ID *"
                  value={addFormData.tagId}
                  onChange={(e) => setAddFormData({ ...addFormData, tagId: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Name"
                  value={addFormData.name}
                  onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Sex *</InputLabel>
                  <Select
                    value={addFormData.sex}
                    label="Sex"
                    onChange={(e) => setAddFormData({ ...addFormData, sex: e.target.value })}
                    required
                  >
                    {sexOptions.filter(sex => sex !== "unknown").map((sex) => (
                      <MenuItem key={sex} value={sex}>
                        {sex.charAt(0).toUpperCase() + sex.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Breed</InputLabel>
                  <Select
                    value={addFormData.breed}
                    label="Breed"
                    onChange={(e) => setAddFormData({ ...addFormData, breed: e.target.value })}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {allBreeds.map((breed) => (
                      <MenuItem key={breed} value={breed}>
                        {breed}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Hatch Date"
                  type="date"
                  value={addFormData.hatchDate}
                  onChange={(e) => setAddFormData({ ...addFormData, hatchDate: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={addFormData.status}
                    label="Status"
                    onChange={(e) => setAddFormData({ ...addFormData, status: e.target.value })}
                  >
                    {statusOptions.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Additional Bird Details for Add Dialog */}
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>More Details</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Species</InputLabel>
                  <Select
                    value={addFormData.species}
                    label="Species"
                    onChange={(e) => setAddFormData({ ...addFormData, species: e.target.value })}
                  >
                    {speciesOptions.map((species) => (
                      <MenuItem key={species} value={species}>
                        {species.charAt(0).toUpperCase() + species.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Strain"
                  value={addFormData.strain}
                  onChange={(e) => setAddFormData({ ...addFormData, strain: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Cross</InputLabel>
                  <Select
                    value={addFormData.cross}
                    label="Cross"
                    onChange={(e) => setAddFormData({ ...addFormData, cross: e.target.value === "true" })}
                  >
                    <MenuItem value="true">Yes</MenuItem>
                    <MenuItem value="false">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Origin</InputLabel>
                  <Select
                    value={addFormData.origin}
                    label="Origin"
                    onChange={(e) => setAddFormData({ ...addFormData, origin: e.target.value })}
                  >
                    {originOptions.map((origin) => (
                      <MenuItem key={origin} value={origin}>
                        {origin.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Foundation Stock</InputLabel>
                  <Select
                    value={addFormData.foundationStock}
                    label="Foundation Stock"
                    onChange={(e) => setAddFormData({ ...addFormData, foundationStock: e.target.value === "true" })}
                  >
                    <MenuItem value="true">Yes</MenuItem>
                    <MenuItem value="false">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Sire ID"
                  value={addFormData.sireId || ""}
                  onChange={(e) => setAddFormData({ ...addFormData, sireId: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Dam ID"
                  value={addFormData.damId || ""}
                  onChange={(e) => setAddFormData({ ...addFormData, damId: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Location</InputLabel>
                  <Select
                    value={addFormData.locationId || ""}
                    label="Location"
                    onChange={(e) => setAddFormData({ ...addFormData, locationId: e.target.value })}
                  >
                    <MenuItem value="">
                      <em>Unassigned</em>
                    </MenuItem>
                    {locations.map((location) => (
                      <MenuItem key={location._id} value={location._id}>
                        {location.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Temperament Score"
                  type="number"
                  value={addFormData.temperamentScore}
                  onChange={(e) => setAddFormData({ ...addFormData, temperamentScore: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Status Date"
                  type="date"
                  value={addFormData.statusDate}
                  onChange={(e) => setAddFormData({ ...addFormData, statusDate: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="Status Reason"
                  value={addFormData.statusReason}
                  onChange={(e) => setAddFormData({ ...addFormData, statusReason: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                  fullWidth
                  multiline
                  rows={3}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>Cancel</Button>
          <Button
            onClick={handleSaveAdd}
            variant="contained"
            disabled={!addFormData.tagId || !addFormData.sex}
          >
            Add Bird
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default BirdsPage;
