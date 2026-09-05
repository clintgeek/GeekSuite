import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import { Container, Button, Box, Alert, TextField, Chip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ResponsiveTable from "../components/primitives/ResponsiveTable";
import LedgerDialog from "../components/primitives/LedgerDialog";
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
  const asDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-";

  /**
   * Ten columns is the widest table in the suite; below `md` `ResponsiveTable`
   * renders each of these rows as a card titled by its set date, with Edit and
   * Delete in a ⋯ sheet rather than as a pair of text buttons.
   */
  const columns = [
    { key: "setDate", label: "Set Date", primary: true, render: (e) => asDate(e.setDate) },
    { key: "hatchDate", label: "Hatch Date", render: (e) => asDate(e.hatchDate) },
    { key: "eggsSet", label: "Eggs Set", render: (e) => e.eggsSet || 0 },
    { key: "eggsFertile", label: "Fertile", render: (e) => e.eggsFertile || 0 },
    { key: "chicksHatched", label: "Hatched", render: (e) => e.chicksHatched || 0 },
    { key: "pullets", label: "Pullets", render: (e) => e.pullets || 0 },
    { key: "cockerels", label: "Cockerels", render: (e) => e.cockerels || 0 },
    { key: "successRate", label: "Success Rate", sortable: false, render: (e) => `${hatchSuccessRate(e)}%` },
    {
      key: "status", label: "Status", sortable: false,
      render: (e) => (
        <Chip label={isHatched(e) ? "Hatched" : "Incubating"} color={isHatched(e) ? "success" : "warning"} size="small" />
      )
    },
    {
      key: "actions", label: "Actions", align: "right", sortable: false, cardHidden: true,
      render: (e) => (
        <>
          <Button startIcon={<EditIcon />} onClick={() => handleEditEvent(e)} sx={{ mr: 1 }}>Edit</Button>
          <Button startIcon={<DeleteIcon />} color="error" onClick={() => handleDeleteEvent(e.id)}>Delete</Button>
        </>
      )
    }
  ];

  const rowActions = (event) => [
    { id: "edit", label: "Edit hatch", icon: <EditIcon />, onClick: () => handleEditEvent(event) },
    { id: "delete", label: "Delete hatch", icon: <DeleteIcon />, color: "error", onClick: () => handleDeleteEvent(event.id) }
  ];

  /** Framed by `ResponsiveTable`: a Paper at `md`+, a sheet below it. */
  const filterFields = (
    <>
      <TextField type="date" label="Start Date" size="small" InputLabelProps={{ shrink: true }} value={filters.startDate}
        onChange={(e) => { setFilters(p => ({ ...p, startDate: e.target.value })); setPage(0); }} />
      <TextField type="date" label="End Date" size="small" InputLabelProps={{ shrink: true }} value={filters.endDate}
        onChange={(e) => { setFilters(p => ({ ...p, endDate: e.target.value })); setPage(0); }} />
    </>
  );

  const numField = (label, key, formData, setForm, required) => (
    <TextField type="number" label={label} fullWidth value={formData[key]} required={required}
      onChange={(e) => setForm(p => ({ ...p, [key]: e.target.value }))} InputLabelProps={{ shrink: true }} />
  );

  return (
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 0, md: 4 }, px: { xs: 0, md: 2 } }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData({ setDate: "", hatchDate: "", eggsSet: "", eggsFertile: "", chicksHatched: "", pullets: "", cockerels: "", notes: "" }); setAddDialogOpen(true); }}>
          Add Hatch
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <ResponsiveTable
        filters={filterFields}
        filterCount={Object.values(filters).filter(Boolean).length}
        columns={columns}
        rows={paginated}
        rowActions={rowActions}
        rowLabel={(e) => `hatch set ${asDate(e.setDate)}`}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        loading={loading}
        emptyMessage="No hatch events found"
        page={page}
        rowsPerPage={rowsPerPage}
        count={sorted.length}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      />

      {/* Edit / Add — one form each, full-screen below `sm` via LedgerDialog.
          The save button lives in the dialog header on a phone, so the form
          carries an id and the button submits it across the DOM. */}
      <LedgerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit hatch event"
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="hatch-edit-form" variant="contained">Save</Button>}
      >
        <Box
          component="form"
          id="hatch-edit-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
          sx={{ display: "grid", gap: 2 }}
        >
          <TextField type="date" label="Set Date" required fullWidth InputLabelProps={{ shrink: true }} value={editFormData.setDate} onChange={(e) => setEditFormData(p => ({ ...p, setDate: e.target.value }))} />
          <TextField type="date" label="Hatch Date" fullWidth InputLabelProps={{ shrink: true }} value={editFormData.hatchDate} onChange={(e) => setEditFormData(p => ({ ...p, hatchDate: e.target.value }))} />
          {numField("Eggs Set", "eggsSet", editFormData, setEditFormData, true)}
          {numField("Fertile Eggs", "eggsFertile", editFormData, setEditFormData, false)}
          {numField("Chicks Hatched", "chicksHatched", editFormData, setEditFormData, false)}
          {numField("Pullets", "pullets", editFormData, setEditFormData, false)}
          {numField("Cockerels", "cockerels", editFormData, setEditFormData, false)}
          <TextField label="Notes" fullWidth multiline rows={3} value={editFormData.notes} onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

      <LedgerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add hatch event"
        secondaryAction={<Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="hatch-add-form" variant="contained">Add</Button>}
      >
        <Box
          component="form"
          id="hatch-add-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveAdd(); }}
          sx={{ display: "grid", gap: 2 }}
        >
          <TextField type="date" label="Set Date" required fullWidth InputLabelProps={{ shrink: true }} value={addFormData.setDate} onChange={(e) => setAddFormData(p => ({ ...p, setDate: e.target.value }))} />
          <TextField type="date" label="Hatch Date" fullWidth InputLabelProps={{ shrink: true }} value={addFormData.hatchDate} onChange={(e) => setAddFormData(p => ({ ...p, hatchDate: e.target.value }))} />
          {numField("Eggs Set", "eggsSet", addFormData, setAddFormData, true)}
          {numField("Fertile Eggs", "eggsFertile", addFormData, setAddFormData, false)}
          {numField("Chicks Hatched", "chicksHatched", addFormData, setAddFormData, false)}
          {numField("Pullets", "pullets", addFormData, setAddFormData, false)}
          {numField("Cockerels", "cockerels", addFormData, setAddFormData, false)}
          <TextField label="Notes" fullWidth multiline rows={3} value={addFormData.notes} onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

    </Container>
  );
};

export default HatchLogPage;
