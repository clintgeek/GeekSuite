import React, { useState, useEffect } from "react";
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableSortLabel,
  TableRow,
  TablePagination,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  IconButton
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import client from "../services/apiClient";
import QuickHarvestEntry from "../components/QuickHarvestEntry";

const EggLogPage = () => {
  const [eggProduction, setEggProduction] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    locationId: ""
  });

  // Locations for quick entry
  const [locations, setLocations] = useState([]);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editFormData, setEditFormData] = useState({
    date: "",
    eggsCount: "",
    locationId: "",
    daysObserved: 1,
    eggColor: "",
    eggSize: "",
    quality: "",
    source: "",
    notes: ""
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    date: "",
    eggsCount: "",
    locationId: "",
    daysObserved: 1,
    eggColor: "",
    eggSize: "",
    quality: "",
    source: "",
    notes: ""
  });

  const fetchEggProduction = async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        page: page + 1,
        sortBy,
        sortOrder,
        limit: rowsPerPage,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      };

      const response = await client.get("/egg-production", { params });
      setEggProduction(response.data.data.eggProduction);
      setTotal(response.data.data.pagination.total);
    } catch (err) {
      setError(err.message || "Failed to fetch egg production records");
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await client.get("/locations", { params: { limit: 100 } });
      setLocations(response.data.data.locations || []);
    } catch (err) {
      console.error("Failed to fetch locations:", err);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchEggProduction();
  }, [page, rowsPerPage, filters, sortBy, sortOrder]);

  const handleDeleteRecord = async (id) => {
    if (!window.confirm("Delete this egg production record?")) return;

    try {
      await client.delete(`/egg-production/${ id }`);
      fetchEggProduction();
    } catch (err) {
      setError(err.message || "Failed to delete record");
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

  // Dialog handlers
  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setEditFormData({
      date: record.date ? record.date.substring(0, 10) : "",
      eggsCount: record.eggsCount || "",
      locationId: record.locationId?._id || record.locationId || "",
      daysObserved: record.daysObserved || 1,
      eggColor: record.eggColor || "",
      eggSize: record.eggSize || "",
      quality: record.quality || "",
      source: record.source || "",
      notes: record.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingRecord(null);
    setEditFormData({
      date: "",
      eggsCount: "",
      locationId: "",
      daysObserved: 1,
      eggColor: "",
      eggSize: "",
      quality: "",
      source: "",
      notes: ""
    });
  };

  const handleSaveEdit = async () => {
    if (!editFormData.date || !editFormData.eggsCount) {
      setError("Date and eggs count are required");
      return;
    }

    try {
      await client.put(`/egg-production/${ editingRecord._id }`, editFormData);
      fetchEggProduction();
      handleCloseEditDialog();
    } catch (err) {
      setError(err.message || "Failed to update record");
    }
  };

  const handleAddRecord = () => {
    setAddFormData({
      date: toLocalDateString(new Date()),
      eggsCount: "",
      locationId: locations.length === 1 ? locations[0]._id : "",
      daysObserved: 1,
      eggColor: "",
      eggSize: "",
      quality: "",
      source: "manual",
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      date: "",
      eggsCount: "",
      locationId: "",
      daysObserved: 1,
      eggColor: "",
      eggSize: "",
      quality: "",
      source: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    if (!addFormData.date || !addFormData.eggsCount) {
      setError("Date and eggs count are required");
      return;
    }

    try {
      await client.post("/egg-production", addFormData);
      fetchEggProduction();
      handleCloseAddDialog();
    } catch (err) {
      setError(err.message || "Failed to create record");
    }
  };

  // Get location name by ID for table display
  const getLocationName = (locId) => {
    const loc = locations.find(l => l._id === locId);
    return loc ? loc.name : "-";
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Quick Harvest Entry */}
      <QuickHarvestEntry
        locations={locations}
        onSuccess={fetchEggProduction}
      />

      {/* History section header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h6" sx={{ color: "text.secondary" }}>
          Harvest History
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddRecord}
        >
          Add Detailed Entry
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField
            type="date"
            label="Start Date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.startDate}
            onChange={(e) => {
              setFilters({ ...filters, startDate: e.target.value });
              setPage(0);
            }}
          />

          <TextField
            type="date"
            label="End Date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.endDate}
            onChange={(e) => {
              setFilters({ ...filters, endDate: e.target.value });
              setPage(0);
            }}
          />

          <FormControl size="small">
            <InputLabel>Location</InputLabel>
            <Select
              value={filters.locationId || ""}
              label="Location"
              onChange={(e) => {
                setFilters({ ...filters, locationId: e.target.value });
                setPage(0);
              }}
            >
              <MenuItem value="">All Locations</MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc._id} value={loc._id}>
                  {loc.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
            <Table size="small">
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "date"}
                      direction={sortBy === "date" ? sortOrder : "asc"}
                      onClick={() => handleSort("date")}
                    >
                      Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell align="center">
                    <TableSortLabel
                      active={sortBy === "eggsCount"}
                      direction={sortBy === "eggsCount" ? sortOrder : "asc"}
                      onClick={() => handleSort("eggsCount")}
                    >
                      Eggs
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center">Days</TableCell>
                  <TableCell align="center">Rate</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eggProduction.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      No egg production records found
                    </TableCell>
                  </TableRow>
                ) : (
                  eggProduction.map((record) => (
                    <TableRow key={record._id} hover>
                      {new Date(record.date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                      <TableCell>
                        {record.locationId ? getLocationName(record.locationId._id || record.locationId) : "-"}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {record.eggsCount}
                      </TableCell>
                      <TableCell align="center">
                        {record.daysObserved || 1}
                      </TableCell>
                      <TableCell align="center" sx={{ color: "text.secondary" }}>
                        {((record.eggsCount) / (record.daysObserved || 1)).toFixed(1)}/day
                      </TableCell>
                      <TableCell sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {record.notes || "-"}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleEditRecord(record)}
                          sx={{ mr: 0.5 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteRecord(record._id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Egg Production Record</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                type="date"
                label="Date"
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={editFormData.date}
                onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
              />
              <TextField
                type="number"
                label="Eggs Count"
                required
                fullWidth
                value={editFormData.eggsCount}
                onChange={(e) => setEditFormData({ ...editFormData, eggsCount: e.target.value })}
              />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Location</InputLabel>
                <Select
                  value={editFormData.locationId}
                  label="Location"
                  onChange={(e) => setEditFormData({ ...editFormData, locationId: e.target.value })}
                >
                  <MenuItem value="">
                    <em>No specific location</em>
                  </MenuItem>
                  {locations.map((loc) => (
                    <MenuItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="number"
                label="Days Observed"
                fullWidth
                inputProps={{ min: 1 }}
                value={editFormData.daysObserved}
                onChange={(e) => setEditFormData({ ...editFormData, daysObserved: parseInt(e.target.value) || 1 })}
                helperText="Days since last harvest"
              />
            </Box>
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add Egg Production Record</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                type="date"
                label="Date"
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={addFormData.date}
                onChange={(e) => setAddFormData({ ...addFormData, date: e.target.value })}
              />
              <TextField
                type="number"
                label="Eggs Count"
                required
                fullWidth
                value={addFormData.eggsCount}
                onChange={(e) => setAddFormData({ ...addFormData, eggsCount: e.target.value })}
              />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Location</InputLabel>
                <Select
                  value={addFormData.locationId}
                  label="Location"
                  onChange={(e) => setAddFormData({ ...addFormData, locationId: e.target.value })}
                >
                  <MenuItem value="">
                    <em>No specific location</em>
                  </MenuItem>
                  {locations.map((loc) => (
                    <MenuItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="number"
                label="Days Observed"
                fullWidth
                inputProps={{ min: 1 }}
                value={addFormData.daysObserved}
                onChange={(e) => setAddFormData({ ...addFormData, daysObserved: parseInt(e.target.value) || 1 })}
                helperText="Days since last harvest"
              />
            </Box>
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={addFormData.notes}
              onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>Cancel</Button>
          <Button onClick={handleSaveAdd} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EggLogPage;
