import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableSortLabel, TableRow, TablePagination, Button, Box,
  Typography, CircularProgress, Alert, TextField, MenuItem, Dialog,
  DialogTitle, DialogContent, DialogActions, FormControl, InputLabel,
  Select, IconButton
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import QuickHarvestEntry from "../components/QuickHarvestEntry";
import { GET_EGG_PRODUCTIONS, GET_LOCATIONS } from "../graphql/queries";
import { RECORD_EGG_PRODUCTION, UPDATE_EGG_PRODUCTION, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { date: "", eggsCount: "", locationId: "", notes: "" };

const EggLogPage = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({ startDate: "", endDate: "", locationId: "" });
  const [mutationError, setMutationError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(emptyForm);

  const { data: eggsData, loading: eggsLoading, error: eggsError } = useQuery(GET_EGG_PRODUCTIONS);
  const { data: locData } = useQuery(GET_LOCATIONS);

  const allEggs = eggsData?.eggProductions || [];
  const locations = locData?.flockLocations || [];

  const refetchList = ['GetEggProductions'];

  const [recordEggProduction] = useMutation(RECORD_EGG_PRODUCTION, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData(emptyForm); },
    onError: (err) => setMutationError(err.message),
  });

  const [updateEggProduction] = useMutation(UPDATE_EGG_PRODUCTION, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setEditDialogOpen(false); setEditingRecord(null); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const filtered = useMemo(() => allEggs.filter(e => {
    const dateStr = e.date ? e.date.substring(0, 10) : "";
    if (filters.startDate && dateStr < filters.startDate) return false;
    if (filters.endDate && dateStr > filters.endDate) return false;
    if (filters.locationId && e.locationId !== filters.locationId) return false;
    return true;
  }), [allEggs, filters]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? ""; const bv = b[sortBy] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  }), [filtered, sortBy, sortOrder]);

  const paginated = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = (col) => { setSortOrder(sortBy === col && sortOrder === "asc" ? "desc" : "asc"); setSortBy(col); setPage(0); };

  const handleDelete = (id) => {
    if (!window.confirm("Delete this egg production record?")) return;
    deleteEntity({ variables: { type: "eggproduction", id } });
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setEditFormData({
      date: record.date ? record.date.substring(0, 10) : "",
      eggsCount: record.eggsCount || "",
      locationId: record.locationId || "",
      notes: record.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editFormData.date || !editFormData.eggsCount) { setMutationError("Date and eggs count are required"); return; }
    updateEggProduction({ variables: {
      id: editingRecord.id,
      date: editFormData.date,
      eggsCount: parseInt(editFormData.eggsCount),
      locationId: editFormData.locationId || undefined,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.date || !addFormData.eggsCount) { setMutationError("Date and eggs count are required"); return; }
    recordEggProduction({ variables: {
      date: addFormData.date,
      eggsCount: parseInt(addFormData.eggsCount),
      locationId: addFormData.locationId || undefined,
      notes: addFormData.notes || undefined,
    }});
  };

  const getLocationName = (locId) => locations.find(l => l.id === locId)?.name ?? "-";

  const sortCol = (col, label) => (
    <TableSortLabel active={sortBy === col} direction={sortBy === col ? sortOrder : "asc"} onClick={() => handleSort(col)}>{label}</TableSortLabel>
  );

  const locationSelect = (formData, setForm) => (
    <FormControl fullWidth>
      <InputLabel>Location</InputLabel>
      <Select value={formData.locationId} label="Location" onChange={(e) => setForm(p => ({ ...p, locationId: e.target.value }))}>
        <MenuItem value=""><em>No specific location</em></MenuItem>
        {locations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
      </Select>
    </FormControl>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <QuickHarvestEntry locations={locations} />

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h6" sx={{ color: "text.secondary" }}>Harvest History</Typography>
        <Button variant="outlined" size="small" startIcon={<AddIcon />}
          onClick={() => { setAddFormData({ date: toLocalDateString(new Date()), eggsCount: "", locationId: locations.length === 1 ? locations[0].id : "", notes: "" }); setAddDialogOpen(true); }}>
          Add Detailed Entry
        </Button>
      </Box>

      {(eggsError || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{eggsError?.message || mutationError}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField type="date" label="Start Date" size="small" InputLabelProps={{ shrink: true }} value={filters.startDate}
            onChange={(e) => { setFilters(p => ({ ...p, startDate: e.target.value })); setPage(0); }} />
          <TextField type="date" label="End Date" size="small" InputLabelProps={{ shrink: true }} value={filters.endDate}
            onChange={(e) => { setFilters(p => ({ ...p, endDate: e.target.value })); setPage(0); }} />
          <FormControl size="small">
            <InputLabel>Location</InputLabel>
            <Select value={filters.locationId} label="Location" onChange={(e) => { setFilters(p => ({ ...p, locationId: e.target.value })); setPage(0); }}>
              <MenuItem value="">All Locations</MenuItem>
              {locations.map((loc) => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        {eggsLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell>{sortCol("date", "Date")}</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell align="center">{sortCol("eggsCount", "Eggs")}</TableCell>
                  <TableCell align="center">Days</TableCell>
                  <TableCell align="center">Rate</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>No egg production records found</TableCell></TableRow>
                ) : paginated.map((record) => (
                  <TableRow key={record.id} hover>
                    <TableCell>{new Date(record.date).toLocaleDateString(undefined, { timeZone: 'UTC' })}</TableCell>
                    <TableCell>{record.locationId ? getLocationName(record.locationId) : "-"}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{record.eggsCount}</TableCell>
                    <TableCell align="center">{record.daysObserved || 1}</TableCell>
                    <TableCell align="center" sx={{ color: "text.secondary" }}>
                      {(record.eggsCount / (record.daysObserved || 1)).toFixed(1)}/day
                    </TableCell>
                    <TableCell sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {record.notes || "-"}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEdit(record)} sx={{ mr: 0.5 }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(record.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
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
        <DialogTitle>Edit Egg Production Record</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField type="date" label="Date" required fullWidth InputLabelProps={{ shrink: true }}
                value={editFormData.date} onChange={(e) => setEditFormData(p => ({ ...p, date: e.target.value }))} />
              <TextField type="number" label="Eggs Count" required fullWidth value={editFormData.eggsCount}
                onChange={(e) => setEditFormData(p => ({ ...p, eggsCount: e.target.value }))} />
            </Box>
            {locationSelect(editFormData, setEditFormData)}
            <TextField label="Notes" fullWidth multiline rows={2} value={editFormData.notes}
              onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Egg Production Record</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField type="date" label="Date" required fullWidth InputLabelProps={{ shrink: true }}
                value={addFormData.date} onChange={(e) => setAddFormData(p => ({ ...p, date: e.target.value }))} />
              <TextField type="number" label="Eggs Count" required fullWidth value={addFormData.eggsCount}
                onChange={(e) => setAddFormData(p => ({ ...p, eggsCount: e.target.value }))} />
            </Box>
            {locationSelect(addFormData, setAddFormData)}
            <TextField label="Notes" fullWidth multiline rows={2} value={addFormData.notes}
              onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAdd} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EggLogPage;
