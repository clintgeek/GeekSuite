import React, { useState, useEffect } from "react";
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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import client from "../services/apiClient";

const HatchLogPage = () => {
  const [hatchEvents, setHatchEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("hatchDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: ""
  });

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editFormData, setEditFormData] = useState({
    setDate: "",
    hatchDate: "",
    eggsSet: "",
    eggsFertile: "",
    chicksHatched: "",
    pullets: "",
    cockerels: "",
    notes: ""
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    setDate: "",
    hatchDate: "",
    eggsSet: "",
    eggsFertile: "",
    chicksHatched: "",
    pullets: "",
    cockerels: "",
    notes: ""
  });

  const fetchHatchEvents = async () => {
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

      const response = await client.get("/hatch-events", { params });
      setHatchEvents(response.data.data.hatchEvents);
      setTotal(response.data.data.pagination.total);
    } catch (err) {
      setError(err.message || "Failed to fetch hatch events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHatchEvents();
  }, [page, rowsPerPage, filters, sortBy, sortOrder]);

  const handleDeleteEvent = async (id) => {
    if (!window.confirm("Delete this hatch event?")) return;

    try {
      await client.delete(`/hatch-events/${id}`);
      fetchHatchEvents();
    } catch (err) {
      setError(err.message || "Failed to delete hatch event");
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
  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setEditFormData({
      setDate: event.setDate ? new Date(event.setDate).toISOString().split('T')[0] : "",
      hatchDate: event.hatchDate ? new Date(event.hatchDate).toISOString().split('T')[0] : "",
      eggsSet: event.eggsSet || "",
      eggsFertile: event.eggsFertile || "",
      chicksHatched: event.chicksHatched || "",
      pullets: event.pullets || "",
      cockerels: event.cockerels || "",
      notes: event.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingEvent(null);
    setEditFormData({
      setDate: "",
      hatchDate: "",
      eggsSet: "",
      eggsFertile: "",
      chicksHatched: "",
      pullets: "",
      cockerels: "",
      notes: ""
    });
  };

  const handleSaveEdit = async () => {
    if (!editFormData.setDate || !editFormData.eggsSet) {
      setError("Set date and eggs set are required");
      return;
    }

    try {
      await client.put(`/hatch-events/${editingEvent._id}`, editFormData);
      fetchHatchEvents();
      handleCloseEditDialog();
    } catch (err) {
      setError(err.message || "Failed to update hatch event");
    }
  };

  const handleAddEvent = () => {
    setAddFormData({
      setDate: "",
      hatchDate: "",
      eggsSet: "",
      eggsFertile: "",
      chicksHatched: "",
      pullets: "",
      cockerels: "",
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      setDate: "",
      hatchDate: "",
      eggsSet: "",
      eggsFertile: "",
      chicksHatched: "",
      pullets: "",
      cockerels: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    if (!addFormData.setDate || !addFormData.eggsSet) {
      setError("Set date and eggs set are required");
      return;
    }

    try {
      await client.post("/hatch-events", addFormData);
      fetchHatchEvents();
      handleCloseAddDialog();
    } catch (err) {
      setError(err.message || "Failed to create hatch event");
    }
  };

  const isHatched = (event) => {
    return event.hatchDate && new Date(event.hatchDate) <= new Date();
  };

  const hatchSuccessRate = (event) => {
    if (!event.eggsSet) return 0;
    return Math.round((event.chicksHatched / event.eggsSet) * 100);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddEvent}
        >
          Add Hatch
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
                      active={sortBy === "setDate"}
                      direction={sortBy === "setDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("setDate")}
                    >
                      Set Date
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
                      active={sortBy === "eggsSet"}
                      direction={sortBy === "eggsSet" ? sortOrder : "asc"}
                      onClick={() => handleSort("eggsSet")}
                    >
                      Eggs Set
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "eggsFertile"}
                      direction={sortBy === "eggsFertile" ? sortOrder : "asc"}
                      onClick={() => handleSort("eggsFertile")}
                    >
                      Fertile
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "chicksHatched"}
                      direction={sortBy === "chicksHatched" ? sortOrder : "asc"}
                      onClick={() => handleSort("chicksHatched")}
                    >
                      Hatched
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "pullets"}
                      direction={sortBy === "pullets" ? sortOrder : "asc"}
                      onClick={() => handleSort("pullets")}
                    >
                      Pullets
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "cockerels"}
                      direction={sortBy === "cockerels" ? sortOrder : "asc"}
                      onClick={() => handleSort("cockerels")}
                    >
                      Cockerels
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Success Rate</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "status"}
                      direction={sortBy === "status" ? sortOrder : "asc"}
                      onClick={() => handleSort("status")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hatchEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      No hatch events found
                    </TableCell>
                  </TableRow>
                ) : (
                  hatchEvents.map((event) => (
                    <TableRow key={event._id} hover>
                      <TableCell>
                        {new Date(event.setDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {event.hatchDate
                          ? new Date(event.hatchDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>{event.eggsSet || 0}</TableCell>
                      <TableCell>{event.eggsFertile || 0}</TableCell>
                      <TableCell>{event.chicksHatched || 0}</TableCell>
                      <TableCell>{event.pullets || 0}</TableCell>
                      <TableCell>{event.cockerels || 0}</TableCell>
                      <TableCell>{hatchSuccessRate(event)}%</TableCell>
                      <TableCell>
                        <Chip
                          label={isHatched(event) ? "Hatched" : "Incubating"}
                          color={isHatched(event) ? "success" : "warning"}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditEvent(event)}
                          sx={{ mr: 1 }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<DeleteIcon />}
                          color="error"
                          onClick={() => handleDeleteEvent(event._id)}
                        >
                          Delete
                        </Button>
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
        <DialogTitle>Edit Hatch Event</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <TextField
              type="date"
              label="Set Date"
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={editFormData.setDate}
              onChange={(e) => setEditFormData({ ...editFormData, setDate: e.target.value })}
            />
            <TextField
              type="date"
              label="Hatch Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={editFormData.hatchDate}
              onChange={(e) => setEditFormData({ ...editFormData, hatchDate: e.target.value })}
            />
            <TextField
              type="number"
              label="Eggs Set"
              required
              fullWidth
              value={editFormData.eggsSet}
              onChange={(e) => setEditFormData({ ...editFormData, eggsSet: e.target.value })}
            />
            <TextField
              type="number"
              label="Fertile Eggs"
              fullWidth
              value={editFormData.eggsFertile}
              onChange={(e) => setEditFormData({ ...editFormData, eggsFertile: e.target.value })}
            />
            <TextField
              type="number"
              label="Chicks Hatched"
              fullWidth
              value={editFormData.chicksHatched}
              onChange={(e) => setEditFormData({ ...editFormData, chicksHatched: e.target.value })}
            />
            <TextField
              type="number"
              label="Pullets"
              fullWidth
              value={editFormData.pullets}
              onChange={(e) => setEditFormData({ ...editFormData, pullets: e.target.value })}
            />
            <TextField
              type="number"
              label="Cockerels"
              fullWidth
              value={editFormData.cockerels}
              onChange={(e) => setEditFormData({ ...editFormData, cockerels: e.target.value })}
            />
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={3}
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
        <DialogTitle>Add Hatch Event</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <TextField
              type="date"
              label="Set Date"
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={addFormData.setDate}
              onChange={(e) => setAddFormData({ ...addFormData, setDate: e.target.value })}
            />
            <TextField
              type="date"
              label="Hatch Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={addFormData.hatchDate}
              onChange={(e) => setAddFormData({ ...addFormData, hatchDate: e.target.value })}
            />
            <TextField
              type="number"
              label="Eggs Set"
              required
              fullWidth
              value={addFormData.eggsSet}
              onChange={(e) => setAddFormData({ ...addFormData, eggsSet: e.target.value })}
            />
            <TextField
              type="number"
              label="Fertile Eggs"
              fullWidth
              value={addFormData.eggsFertile}
              onChange={(e) => setAddFormData({ ...addFormData, eggsFertile: e.target.value })}
            />
            <TextField
              type="number"
              label="Chicks Hatched"
              fullWidth
              value={addFormData.chicksHatched}
              onChange={(e) => setAddFormData({ ...addFormData, chicksHatched: e.target.value })}
            />
            <TextField
              type="number"
              label="Pullets"
              fullWidth
              value={addFormData.pullets}
              onChange={(e) => setAddFormData({ ...addFormData, pullets: e.target.value })}
            />
            <TextField
              type="number"
              label="Cockerels"
              fullWidth
              value={addFormData.cockerels}
              onChange={(e) => setAddFormData({ ...addFormData, cockerels: e.target.value })}
            />
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={3}
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

export default HatchLogPage;
