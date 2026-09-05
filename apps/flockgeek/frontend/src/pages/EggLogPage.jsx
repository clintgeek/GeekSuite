import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container, Button, Box, Typography, Alert, TextField, MenuItem,
  FormControl, InputLabel, Select, IconButton
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import QuickHarvestEntry from "../components/QuickHarvestEntry";
import QuickHarvestSheet from "../components/QuickHarvestSheet";
import ResponsiveTable from "../components/primitives/ResponsiveTable";
import LedgerDialog from "../components/primitives/LedgerDialog";
import { GET_EGG_PRODUCTIONS, GET_LOCATIONS } from "../graphql/queries";
import { RECORD_EGG_PRODUCTION, UPDATE_EGG_PRODUCTION, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { date: "", eggsCount: "", daysObserved: 1, locationId: "", notes: "" };

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
      daysObserved: record.daysObserved || 1,
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
      daysObserved: parseInt(editFormData.daysObserved) || 1,
      locationId: editFormData.locationId || undefined,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.date || !addFormData.eggsCount) { setMutationError("Date and eggs count are required"); return; }
    recordEggProduction({ variables: {
      date: addFormData.date,
      eggsCount: parseInt(addFormData.eggsCount),
      daysObserved: parseInt(addFormData.daysObserved) || 1,
      locationId: addFormData.locationId || undefined,
      notes: addFormData.notes || undefined,
    }});
  };

  const getLocationName = (locId) => locations.find(l => l.id === locId)?.name ?? "-";

  const asDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-";

  /**
   * Below `md` each harvest is a card titled by its date; the two 20px icon
   * buttons at the end of the row become a ⋯ sheet.
   */
  const columns = [
    { key: "date", label: "Date", primary: true, render: (r) => asDate(r.date) },
    { key: "location", label: "Location", sortable: false, render: (r) => (r.locationId ? getLocationName(r.locationId) : "-") },
    { key: "eggsCount", label: "Eggs", align: "center", cellSx: { fontWeight: 600 }, render: (r) => r.eggsCount },
    { key: "daysObserved", label: "Days", align: "center", sortable: false, render: (r) => r.daysObserved || 1 },
    {
      key: "rate", label: "Rate", align: "center", sortable: false, cellSx: { color: "text.secondary" },
      render: (r) => `${(r.eggsCount / (r.daysObserved || 1)).toFixed(1)}/day`
    },
    {
      key: "notes", label: "Notes", sortable: false,
      cellSx: { maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      render: (r) => r.notes || "-"
    },
    {
      key: "actions", label: "Actions", align: "right", sortable: false, cardHidden: true,
      render: (r) => (
        <>
          <IconButton aria-label="Edit record" onClick={() => handleEdit(r)} sx={{ mr: 0.5 }}><EditIcon fontSize="small" /></IconButton>
          <IconButton aria-label="Delete record" color="error" onClick={() => handleDelete(r.id)}><DeleteIcon fontSize="small" /></IconButton>
        </>
      )
    }
  ];

  /** Framed by `ResponsiveTable`: a Paper at `md`+, a sheet below it. */
  const filterFields = (
    <>
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
    </>
  );

  const rowActions = (record) => [
    { id: "edit", label: "Edit harvest", icon: <EditIcon />, onClick: () => handleEdit(record) },
    { id: "delete", label: "Delete harvest", icon: <DeleteIcon />, color: "error", onClick: () => handleDelete(record.id) }
  ];

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
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 0, md: 4 }, px: { xs: 0, md: 2 } }}>
      {/* The harvest panel keeps its place at `md`+. Below that it would sit
          mid-page behind a scroll, so the same component is mounted in the
          thumb-zone sheet instead (MOBILE_UI_PLAN.md §4). */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <QuickHarvestEntry locations={locations} />
      </Box>
      <QuickHarvestSheet locations={locations} />

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 3 }}>
        <Typography variant="h6" sx={{ color: "text.secondary" }}>Harvest History</Typography>
        <Button variant="outlined" startIcon={<AddIcon />} sx={{ minHeight: 44 }}
          onClick={() => { setAddFormData({ date: toLocalDateString(new Date()), eggsCount: "", daysObserved: 1, locationId: locations.length === 1 ? locations[0].id : "", notes: "" }); setAddDialogOpen(true); }}>
          Add Detailed Entry
        </Button>
      </Box>

      {(eggsError || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{eggsError?.message || mutationError}</Alert>}

      <ResponsiveTable
        filters={filterFields}
        filterCount={Object.values(filters).filter(Boolean).length}
        columns={columns}
        rows={paginated}
        rowActions={rowActions}
        rowLabel={(r) => `harvest on ${asDate(r.date)}`}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        loading={eggsLoading}
        emptyMessage="No egg production records found"
        page={page}
        rowsPerPage={rowsPerPage}
        count={sorted.length}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        tableProps={{ size: "small" }}
      />

      {/* Edit / Add — full-screen below `sm`. The date/count/days triple was a
          fixed three-column grid; it stacks at xs. */}
      <LedgerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit harvest"
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="egg-edit-form" variant="contained">Save</Button>}
      >
        <Box
          component="form"
          id="egg-edit-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
          sx={{ display: "grid", gap: 2 }}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            <TextField type="date" label="Date" required fullWidth InputLabelProps={{ shrink: true }}
              value={editFormData.date} onChange={(e) => setEditFormData(p => ({ ...p, date: e.target.value }))} />
            <TextField type="number" label="Eggs Count" required fullWidth value={editFormData.eggsCount}
              onChange={(e) => setEditFormData(p => ({ ...p, eggsCount: e.target.value }))} />
            <TextField type="number" label="Days Observed" required fullWidth value={editFormData.daysObserved}
              onChange={(e) => setEditFormData(p => ({ ...p, daysObserved: e.target.value }))} />
          </Box>
          {locationSelect(editFormData, setEditFormData)}
          <TextField label="Notes" fullWidth multiline rows={2} value={editFormData.notes}
            onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

      <LedgerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add harvest"
        secondaryAction={<Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="egg-add-form" variant="contained">Add</Button>}
      >
        <Box
          component="form"
          id="egg-add-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveAdd(); }}
          sx={{ display: "grid", gap: 2 }}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            <TextField type="date" label="Date" required fullWidth InputLabelProps={{ shrink: true }}
              value={addFormData.date} onChange={(e) => setAddFormData(p => ({ ...p, date: e.target.value }))} />
            <TextField type="number" label="Eggs Count" required fullWidth value={addFormData.eggsCount}
              onChange={(e) => setAddFormData(p => ({ ...p, eggsCount: e.target.value }))} />
            <TextField type="number" label="Days Observed" required fullWidth value={addFormData.daysObserved}
              onChange={(e) => setAddFormData(p => ({ ...p, daysObserved: e.target.value }))} />
          </Box>
          {locationSelect(addFormData, setAddFormData)}
          <TextField label="Notes" fullWidth multiline rows={2} value={addFormData.notes}
            onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

    </Container>
  );
};

export default EggLogPage;
