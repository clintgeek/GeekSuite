import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableSortLabel, TableRow, TablePagination, Button, Box,
  CircularProgress, Alert, TextField, MenuItem, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { GET_PAIRINGS } from "../graphql/queries";
import { CREATE_PAIRING, UPDATE_PAIRING, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { name: "", pairingDate: "", active: true, notes: "" };

const PairingsPage = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("pairingDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({ active: "", q: "" });
  const [mutationError, setMutationError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPairing, setEditingPairing] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(emptyForm);

  const { data, loading, error } = useQuery(GET_PAIRINGS);

  const refetchList = ['GetPairings'];

  const [createPairing] = useMutation(CREATE_PAIRING, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData(emptyForm); },
    onError: (err) => setMutationError(err.message),
  });

  const [updatePairing] = useMutation(UPDATE_PAIRING, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setEditDialogOpen(false); setEditingPairing(null); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const allPairings = data?.pairings || [];

  const filtered = useMemo(() => allPairings.filter(p => {
    if (filters.active === "true" && !p.active) return false;
    if (filters.active === "false" && p.active) return false;
    if (filters.q && !p.name?.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  }), [allPairings, filters]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av, bv;
    if (sortBy === "season") {
      av = `${a.seasonYear ?? ""}-${a.season ?? ""}`;
      bv = `${b.seasonYear ?? ""}-${b.season ?? ""}`;
    } else if (sortBy === "status") {
      av = a.active ? "1" : "0";
      bv = b.active ? "1" : "0";
    } else {
      av = a[sortBy] ?? "";
      bv = b[sortBy] ?? "";
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  }), [filtered, sortBy, sortOrder]);

  const paginated = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = (col) => { setSortOrder(sortBy === col && sortOrder === "asc" ? "desc" : "asc"); setSortBy(col); setPage(0); };

  const handleDelete = (id) => {
    if (!window.confirm("Delete this pairing?")) return;
    deleteEntity({ variables: { type: "pairing", id } });
  };

  const handleEdit = (pairing) => {
    setEditingPairing(pairing);
    setEditFormData({
      name: pairing.name || "",
      pairingDate: pairing.pairingDate ? toLocalDateString(pairing.pairingDate) : "",
      active: pairing.active ?? true,
      notes: pairing.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editFormData.name) { setMutationError("Name is required"); return; }
    updatePairing({ variables: {
      id: editingPairing.id,
      name: editFormData.name,
      pairingDate: editFormData.pairingDate || undefined,
      active: editFormData.active,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.name) { setMutationError("Name is required"); return; }
    createPairing({ variables: {
      name: addFormData.name,
      pairingDate: addFormData.pairingDate || undefined,
      notes: addFormData.notes || undefined,
    }});
  };

  const sortCol = (col, label) => (
    <TableSortLabel active={sortBy === col} direction={sortBy === col ? sortOrder : "asc"} onClick={() => handleSort(col)}>{label}</TableSortLabel>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData({ ...emptyForm, pairingDate: toLocalDateString(new Date()) }); setAddDialogOpen(true); }}>
          Add Pairing
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField label="Search" size="small" placeholder="Pairing name" value={filters.q}
            onChange={(e) => { setFilters(p => ({ ...p, q: e.target.value })); setPage(0); }} />
          <TextField select label="Status" size="small" value={filters.active}
            onChange={(e) => { setFilters(p => ({ ...p, active: e.target.value })); setPage(0); }}>
            <MenuItem value="">All Pairings</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </TextField>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell>{sortCol("name", "Name")}</TableCell>
                  <TableCell>Roosters</TableCell>
                  <TableCell>Hens</TableCell>
                  <TableCell>{sortCol("season", "Season")}</TableCell>
                  <TableCell>{sortCol("status", "Status")}</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>No pairings found</TableCell></TableRow>
                ) : paginated.map((pairing) => (
                  <TableRow key={pairing.id} hover>
                    <TableCell>{pairing.name}</TableCell>
                    <TableCell>{pairing.roosterIds?.length || 0}</TableCell>
                    <TableCell>{pairing.henIds?.length || 0}</TableCell>
                    <TableCell>{pairing.season && pairing.seasonYear ? `${pairing.season} ${pairing.seasonYear}` : "-"}</TableCell>
                    <TableCell>
                      <Chip label={pairing.active ? "Active" : "Inactive"} color={pairing.active ? "success" : "default"} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<EditIcon />} onClick={() => handleEdit(pairing)} sx={{ mr: 1 }}>Edit</Button>
                      <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={() => handleDelete(pairing.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination rowsPerPageOptions={[5, 10, 25]} component="div" count={sorted.length}
              rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
          </>
        )}
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Pairing</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="Name" required fullWidth value={editFormData.name} onChange={(e) => setEditFormData(p => ({ ...p, name: e.target.value }))} />
            <TextField type="date" label="Pairing Date" fullWidth InputLabelProps={{ shrink: true }} value={editFormData.pairingDate} onChange={(e) => setEditFormData(p => ({ ...p, pairingDate: e.target.value }))} />
            <TextField select label="Status" fullWidth value={editFormData.active} onChange={(e) => setEditFormData(p => ({ ...p, active: e.target.value === "true" }))}>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </TextField>
            <TextField label="Notes" fullWidth multiline rows={2} value={editFormData.notes} onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Pairing</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="Name" required fullWidth value={addFormData.name} onChange={(e) => setAddFormData(p => ({ ...p, name: e.target.value }))} />
            <TextField type="date" label="Pairing Date" fullWidth InputLabelProps={{ shrink: true }} value={addFormData.pairingDate} onChange={(e) => setAddFormData(p => ({ ...p, pairingDate: e.target.value }))} />
            <TextField label="Notes" fullWidth multiline rows={2} value={addFormData.notes} onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAdd} variant="contained" disabled={!addFormData.name}>Add Pairing</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PairingsPage;
