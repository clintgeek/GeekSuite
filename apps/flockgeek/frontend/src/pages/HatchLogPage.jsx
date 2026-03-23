import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableSortLabel, TableRow, TablePagination, Button, Box,
  CircularProgress, Alert, TextField, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { GET_HATCH_EVENTS } from "../graphql/queries";
import { RECORD_HATCH_EVENT, UPDATE_HATCH_EVENT, DELETE_ENTITY } from "../graphql/mutations";

const HatchLogPage = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("setDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({ startDate: "", endDate: "" });
  const [mutationError, setMutationError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editFormData, setEditFormData] = useState({ setDate: "", hatchDate: "", eggsSet: "", eggsFertile: "", chicksHatched: "", pullets: "", cockerels: "", notes: "" });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({ setDate: "", hatchDate: "", eggsSet: "", eggsFertile: "", chicksHatched: "", pullets: "", cockerels: "", notes: "" });

  const { data, loading, error } = useQuery(GET_HATCH_EVENTS);

  const refetchList = ['GetHatchEvents'];

  const [recordHatchEvent] = useMutation(RECORD_HATCH_EVENT, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData({ setDate: "", hatchDate: "", eggsSet: "", eggsFertile: "", chicksHatched: "", pullets: "", cockerels: "", notes: "" }); },
    onError: (err) => setMutationError(err.message),
  });

  const [updateHatchEvent] = useMutation(UPDATE_HATCH_EVENT, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setEditDialogOpen(false); setEditingEvent(null); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const allEvents = data?.hatchEvents || [];

  const filtered = useMemo(() => allEvents.filter(e => {
    if (filters.startDate && e.setDate < filters.startDate) return false;
    if (filters.endDate && e.setDate > filters.endDate) return false;
    return true;
  }), [allEvents, filters]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? ""; const bv = b[sortBy] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  }), [filtered, sortBy, sortOrder]);

  const paginated = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = (col) => { setSortOrder(sortBy === col && sortOrder === "asc" ? "desc" : "asc"); setSortBy(col); setPage(0); };

  const handleDeleteEvent = (id) => {
    if (!window.confirm("Delete this hatch event?")) return;
    deleteEntity({ variables: { type: "hatch_event", id } });
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setEditFormData({
      setDate: event.setDate ? toLocalDateString(event.setDate) : "",
      hatchDate: event.hatchDate ? toLocalDateString(event.hatchDate) : "",
      eggsSet: event.eggsSet || "", eggsFertile: event.eggsFertile || "",
      chicksHatched: event.chicksHatched || "", pullets: event.pullets || "",
      cockerels: event.cockerels || "", notes: event.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editFormData.setDate || !editFormData.eggsSet) { setMutationError("Set date and eggs set are required"); return; }
    updateHatchEvent({ variables: {
      id: editingEvent.id,
      setDate: editFormData.setDate || undefined,
      hatchDate: editFormData.hatchDate || undefined,
      eggsSet: editFormData.eggsSet ? parseInt(editFormData.eggsSet) : undefined,
      eggsFertile: editFormData.eggsFertile ? parseInt(editFormData.eggsFertile) : undefined,
      chicksHatched: editFormData.chicksHatched ? parseInt(editFormData.chicksHatched) : undefined,
      pullets: editFormData.pullets ? parseInt(editFormData.pullets) : undefined,
      cockerels: editFormData.cockerels ? parseInt(editFormData.cockerels) : undefined,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.setDate || !addFormData.eggsSet) { setMutationError("Set date and eggs set are required"); return; }
    recordHatchEvent({ variables: {
      setDate: addFormData.setDate,
      hatchDate: addFormData.hatchDate || undefined,
      eggsSet: parseInt(addFormData.eggsSet),
      notes: addFormData.notes || undefined,
    }});
  };

  const isHatched = (event) => event.hatchDate && new Date(event.hatchDate) <= new Date();
  const hatchSuccessRate = (event) => !event.eggsSet ? 0 : Math.round((event.chicksHatched / event.eggsSet) * 100);

  const sortCol = (col, label) => (
    <TableSortLabel active={sortBy === col} direction={sortBy === col ? sortOrder : "asc"} onClick={() => handleSort(col)}>{label}</TableSortLabel>
  );

  const numField = (label, key, formData, setForm, required) => (
    <TextField type="number" label={label} fullWidth value={formData[key]} required={required}
      onChange={(e) => setForm(p => ({ ...p, [key]: e.target.value }))} InputLabelProps={{ shrink: true }} />
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData({ setDate: "", hatchDate: "", eggsSet: "", eggsFertile: "", chicksHatched: "", pullets: "", cockerels: "", notes: "" }); setAddDialogOpen(true); }}>
          Add Hatch
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField type="date" label="Start Date" size="small" InputLabelProps={{ shrink: true }} value={filters.startDate}
            onChange={(e) => { setFilters(p => ({ ...p, startDate: e.target.value })); setPage(0); }} />
          <TextField type="date" label="End Date" size="small" InputLabelProps={{ shrink: true }} value={filters.endDate}
            onChange={(e) => { setFilters(p => ({ ...p, endDate: e.target.value })); setPage(0); }} />
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
                  <TableCell>{sortCol("setDate", "Set Date")}</TableCell>
                  <TableCell>{sortCol("hatchDate", "Hatch Date")}</TableCell>
                  <TableCell>{sortCol("eggsSet", "Eggs Set")}</TableCell>
                  <TableCell>{sortCol("eggsFertile", "Fertile")}</TableCell>
                  <TableCell>{sortCol("chicksHatched", "Hatched")}</TableCell>
                  <TableCell>{sortCol("pullets", "Pullets")}</TableCell>
                  <TableCell>{sortCol("cockerels", "Cockerels")}</TableCell>
                  <TableCell>Success Rate</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}>No hatch events found</TableCell></TableRow>
                ) : paginated.map((event) => (
                  <TableRow key={event.id} hover>
                    <TableCell>{new Date(event.setDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}</TableCell>
                    <TableCell>{event.hatchDate ? new Date(event.hatchDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-"}</TableCell>
                    <TableCell>{event.eggsSet || 0}</TableCell>
                    <TableCell>{event.eggsFertile || 0}</TableCell>
                    <TableCell>{event.chicksHatched || 0}</TableCell>
                    <TableCell>{event.pullets || 0}</TableCell>
                    <TableCell>{event.cockerels || 0}</TableCell>
                    <TableCell>{hatchSuccessRate(event)}%</TableCell>
                    <TableCell>
                      <Chip label={isHatched(event) ? "Hatched" : "Incubating"} color={isHatched(event) ? "success" : "warning"} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<EditIcon />} onClick={() => handleEditEvent(event)} sx={{ mr: 1 }}>Edit</Button>
                      <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={() => handleDeleteEvent(event.id)}>Delete</Button>
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
        <DialogTitle>Edit Hatch Event</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <TextField type="date" label="Set Date" required fullWidth InputLabelProps={{ shrink: true }} value={editFormData.setDate} onChange={(e) => setEditFormData(p => ({ ...p, setDate: e.target.value }))} />
            <TextField type="date" label="Hatch Date" fullWidth InputLabelProps={{ shrink: true }} value={editFormData.hatchDate} onChange={(e) => setEditFormData(p => ({ ...p, hatchDate: e.target.value }))} />
            {numField("Eggs Set", "eggsSet", editFormData, setEditFormData, true)}
            {numField("Fertile Eggs", "eggsFertile", editFormData, setEditFormData, false)}
            {numField("Chicks Hatched", "chicksHatched", editFormData, setEditFormData, false)}
            {numField("Pullets", "pullets", editFormData, setEditFormData, false)}
            {numField("Cockerels", "cockerels", editFormData, setEditFormData, false)}
            <TextField label="Notes" fullWidth multiline rows={3} value={editFormData.notes} onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Hatch Event</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "grid", gap: 2 }}>
            <TextField type="date" label="Set Date" required fullWidth InputLabelProps={{ shrink: true }} value={addFormData.setDate} onChange={(e) => setAddFormData(p => ({ ...p, setDate: e.target.value }))} />
            <TextField type="date" label="Hatch Date" fullWidth InputLabelProps={{ shrink: true }} value={addFormData.hatchDate} onChange={(e) => setAddFormData(p => ({ ...p, hatchDate: e.target.value }))} />
            {numField("Eggs Set", "eggsSet", addFormData, setAddFormData, true)}
            {numField("Fertile Eggs", "eggsFertile", addFormData, setAddFormData, false)}
            {numField("Chicks Hatched", "chicksHatched", addFormData, setAddFormData, false)}
            {numField("Pullets", "pullets", addFormData, setAddFormData, false)}
            {numField("Cockerels", "cockerels", addFormData, setAddFormData, false)}
            <TextField label="Notes" fullWidth multiline rows={3} value={addFormData.notes} onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
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

export default HatchLogPage;
