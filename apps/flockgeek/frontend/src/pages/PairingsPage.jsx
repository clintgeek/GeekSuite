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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import client from "../services/apiClient";

const PairingsPage = () => {
  const [pairings, setPairings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("pairingDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({
    active: "",
    q: ""
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPairing, setEditingPairing] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    roosterIds: [],
    henIds: [],
    pairingDate: "",
    notes: ""
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: "",
    roosterIds: [],
    henIds: [],
    pairingDate: "",
    notes: ""
  });

  const fetchPairings = async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        page: page + 1,
        sortBy,
        sortOrder,
        limit: rowsPerPage,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""))
      };

      const response = await client.get("/pairings", { params });
      setPairings(response.data.data.pairings);
      setTotal(response.data.data.pagination.total);
    } catch (err) {
      setError(err.message || "Failed to fetch pairings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPairings();
  }, [page, rowsPerPage, filters, sortBy, sortOrder]);

  const handleDeletePairing = async (id) => {
    if (!window.confirm("Delete this pairing?")) return;

    try {
      await client.delete(`/pairings/${id}`);
      fetchPairings();
    } catch (err) {
      setError(err.message || "Failed to delete pairing");
    }
  };

  const handleEditPairing = (pairing) => {
    setEditingPairing(pairing);
    setEditFormData({
      name: pairing.name || "",
      roosterIds: pairing.roosterIds || [],
      henIds: pairing.henIds || [],
      pairingDate: pairing.pairingDate ? toLocalDateString(pairing.pairingDate) : "",
      notes: pairing.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingPairing(null);
    setEditFormData({
      name: "",
      roosterIds: [],
      henIds: [],
      pairingDate: "",
      notes: ""
    });
  };

  const handleSaveEdit = async () => {
    try {
      const dataToSend = {
        ...editFormData,
        pairingDate: editFormData.pairingDate ? new Date(editFormData.pairingDate).toISOString() : null
      };

      await client.put(`/pairings/${editingPairing._id}`, dataToSend);
      setEditDialogOpen(false);
      fetchPairings();
    } catch (err) {
      setError(err.message || "Failed to update pairing");
    }
  };

  const handleAddPairing = () => {
    setAddFormData({
      name: "",
      roosterIds: [],
      henIds: [],
      pairingDate: toLocalDateString(new Date()),
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      name: "",
      roosterIds: [],
      henIds: [],
      pairingDate: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    try {
      const dataToSend = {
        ...addFormData,
        pairingDate: addFormData.pairingDate ? new Date(addFormData.pairingDate).toISOString() : null
      };

      await client.post("/pairings", dataToSend);
      setAddDialogOpen(false);
      fetchPairings();
    } catch (err) {
      setError(err.message || "Failed to create pairing");
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <div></div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddPairing}
        >
          Add Pairing
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField
            label="Search"
            size="small"
            placeholder="Pairing name"
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
            value={filters.active}
            onChange={(e) => {
              setFilters({ ...filters, active: e.target.value });
              setPage(0);
            }}
          >
            <MenuItem value="">All Pairings</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
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
                      active={sortBy === "name"}
                      direction={sortBy === "name" ? sortOrder : "asc"}
                      onClick={() => handleSort("name")}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Roosters</TableCell>
                  <TableCell>Hens</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === "season"}
                      direction={sortBy === "season" ? sortOrder : "asc"}
                      onClick={() => handleSort("season")}
                    >
                      Season
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
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pairings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      No pairings found
                    </TableCell>
                  </TableRow>
                ) : (
                  pairings.map((pairing) => (
                    <TableRow key={pairing._id} hover>
                      <TableCell>{pairing.name}</TableCell>
                      <TableCell>{pairing.roosterIds?.length || 0}</TableCell>
                      <TableCell>{pairing.henIds?.length || 0}</TableCell>
                      <TableCell>
                        {pairing.season && pairing.seasonYear
                          ? `${pairing.season} ${pairing.seasonYear}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={pairing.active ? "Active" : "Inactive"}
                          color={pairing.active ? "success" : "default"}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditPairing(pairing)}
                          sx={{ mr: 1 }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<DeleteIcon />}
                          color="error"
                          onClick={() => handleDeletePairing(pairing._id)}
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

      {/* Edit Pairing Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Pairing</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Rooster Count"
              type="number"
              value={editFormData.roosterIds.length}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 0;
                setEditFormData({ ...editFormData, roosterIds: Array(count).fill(null) });
              }}
              fullWidth
            />
            <TextField
              label="Hen Count"
              type="number"
              value={editFormData.henIds.length}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 0;
                setEditFormData({ ...editFormData, henIds: Array(count).fill(null) });
              }}
              fullWidth
            />
            <TextField
              label="Pairing Date"
              type="date"
              value={editFormData.pairingDate}
              onChange={(e) => setEditFormData({ ...editFormData, pairingDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
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

      {/* Add Pairing Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Pairing</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name *"
              value={addFormData.name}
              onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Rooster Count"
              type="number"
              value={addFormData.roosterIds.length}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 0;
                setAddFormData({ ...addFormData, roosterIds: Array(count).fill(null) });
              }}
              fullWidth
            />
            <TextField
              label="Hen Count"
              type="number"
              value={addFormData.henIds.length}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 0;
                setAddFormData({ ...addFormData, henIds: Array(count).fill(null) });
              }}
              fullWidth
            />
            <TextField
              label="Pairing Date"
              type="date"
              value={addFormData.pairingDate}
              onChange={(e) => setAddFormData({ ...addFormData, pairingDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
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
            Add Pairing
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PairingsPage;
