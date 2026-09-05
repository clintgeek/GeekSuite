import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import { Container, Button, Box, Alert, TextField, MenuItem, Chip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ResponsiveTable from "../components/primitives/ResponsiveTable";
import LedgerDialog from "../components/primitives/LedgerDialog";
import { GET_PAIRINGS } from "../graphql/queries";
import { CREATE_PAIRING, UPDATE_PAIRING, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { name: "", pairingDate: "", active: true, notes: "" };

const PairingsPage = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("startDate");
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
      pairingDate: pairing.startDate ? toLocalDateString(pairing.startDate) : "",
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

  /**
   * Six columns; below `md` each pairing is a card titled by its name, with
   * Edit and Delete moved out of the row and into a ⋯ sheet.
   */
  const columns = [
    { key: "name", label: "Name", primary: true },
    { key: "roosters", label: "Roosters", sortable: false, render: (p) => p.roosterIds?.length || 0 },
    { key: "hens", label: "Hens", sortable: false, render: (p) => p.henIds?.length || 0 },
    { key: "season", label: "Season", render: (p) => (p.season && p.seasonYear ? `${p.season} ${p.seasonYear}` : "-") },
    {
      key: "status", label: "Status",
      render: (p) => <Chip label={p.active ? "Active" : "Inactive"} color={p.active ? "success" : "default"} size="small" />
    },
    {
      key: "actions", label: "Actions", align: "right", sortable: false, cardHidden: true,
      render: (p) => (
        <>
          <Button startIcon={<EditIcon />} onClick={() => handleEdit(p)} sx={{ mr: 1 }}>Edit</Button>
          <Button startIcon={<DeleteIcon />} color="error" onClick={() => handleDelete(p.id)}>Delete</Button>
        </>
      )
    }
  ];

  /** Framed by `ResponsiveTable`: a Paper at `md`+, a sheet below it. */
  const filterFields = (
    <>
      <TextField label="Search" size="small" placeholder="Pairing name" value={filters.q}
        onChange={(e) => { setFilters(p => ({ ...p, q: e.target.value })); setPage(0); }} />
      <TextField select label="Status" size="small" value={filters.active}
        onChange={(e) => { setFilters(p => ({ ...p, active: e.target.value })); setPage(0); }}>
        <MenuItem value="">All Pairings</MenuItem>
        <MenuItem value="true">Active</MenuItem>
        <MenuItem value="false">Inactive</MenuItem>
      </TextField>
    </>
  );

  const rowActions = (pairing) => [
    { id: "edit", label: "Edit pairing", icon: <EditIcon />, onClick: () => handleEdit(pairing) },
    { id: "delete", label: "Delete pairing", icon: <DeleteIcon />, color: "error", onClick: () => handleDelete(pairing.id) }
  ];

  return (
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 0, md: 4 }, px: { xs: 0, md: 2 } }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData({ ...emptyForm, pairingDate: toLocalDateString(new Date()) }); setAddDialogOpen(true); }}>
          Add Pairing
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <ResponsiveTable
        filters={filterFields}
        filterCount={Object.values(filters).filter(Boolean).length}
        columns={columns}
        rows={paginated}
        rowActions={rowActions}
        rowLabel={(p) => p.name}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        loading={loading}
        emptyMessage="No pairings found"
        page={page}
        rowsPerPage={rowsPerPage}
        count={sorted.length}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      />

      {/* Edit / Add — full-screen below `sm`; the header's save button submits
          the body's form by id. */}
      <LedgerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit pairing"
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="pairing-edit-form" variant="contained">Save</Button>}
      >
        <Box
          component="form"
          id="pairing-edit-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField label="Name" required fullWidth value={editFormData.name} onChange={(e) => setEditFormData(p => ({ ...p, name: e.target.value }))} />
          <TextField type="date" label="Pairing Date" fullWidth InputLabelProps={{ shrink: true }} value={editFormData.pairingDate} onChange={(e) => setEditFormData(p => ({ ...p, pairingDate: e.target.value }))} />
          <TextField select label="Status" fullWidth value={editFormData.active} onChange={(e) => setEditFormData(p => ({ ...p, active: e.target.value === "true" }))}>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </TextField>
          <TextField label="Notes" fullWidth multiline rows={2} value={editFormData.notes} onChange={(e) => setEditFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

      <LedgerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add new pairing"
        secondaryAction={<Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>}
        primaryAction={
          <Button type="submit" form="pairing-add-form" variant="contained" disabled={!addFormData.name}>Add Pairing</Button>
        }
      >
        <Box
          component="form"
          id="pairing-add-form"
          onSubmit={(e) => { e.preventDefault(); handleSaveAdd(); }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField label="Name" required fullWidth value={addFormData.name} onChange={(e) => setAddFormData(p => ({ ...p, name: e.target.value }))} />
          <TextField type="date" label="Pairing Date" fullWidth InputLabelProps={{ shrink: true }} value={addFormData.pairingDate} onChange={(e) => setAddFormData(p => ({ ...p, pairingDate: e.target.value }))} />
          <TextField label="Notes" fullWidth multiline rows={2} value={addFormData.notes} onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
        </Box>
      </LedgerDialog>

    </Container>
  );
};

export default PairingsPage;
