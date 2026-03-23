import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
import {
  Container, Paper, Button, Box, Typography, CircularProgress, Alert,
  TextField, MenuItem, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, Accordion,
  AccordionSummary, AccordionDetails, List, ListItem, ListItemText,
  IconButton, Stack
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { GET_FLOCK_GROUPS, GET_GROUP_MEMBERSHIPS } from "../graphql/queries";
import { CREATE_FLOCK_GROUP, UPDATE_FLOCK_GROUP, DELETE_ENTITY } from "../graphql/mutations";

const emptyForm = { name: "", purpose: "", type: "", startDate: "", endDate: "", description: "", notes: "" };
const purposeOptions = ["layer_flock", "breeder_flock", "meat_flock", "brooder", "other"];
const getPurposeLabel = (purpose) => purpose ? purpose.replace(/_/g, " ") : "";
const getPurposeColor = (purpose) => ({ layer_flock: "primary", breeder_flock: "info", meat_flock: "warning", brooder: "success" }[purpose] ?? "default");

const isActive = (group) => {
  const now = new Date();
  const start = group.startDate ? new Date(group.startDate) : null;
  const end = group.endDate ? new Date(group.endDate) : null;
  if (!start || start > now) return false;
  if (end && end < now) return false;
  return true;
};

const GroupsPage = () => {
  const [filters, setFilters] = useState({ purpose: "", q: "" });
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [mutationError, setMutationError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(emptyForm);

  const { data: groupsData, loading, error } = useQuery(GET_FLOCK_GROUPS);
  const { data: membershipsData } = useQuery(GET_GROUP_MEMBERSHIPS, { variables: { activeOnly: true } });

  const allGroups = groupsData?.flockGroups || [];
  const allMemberships = membershipsData?.groupMemberships || [];

  const refetchList = ['GetFlockGroups'];

  const [createFlockGroup] = useMutation(CREATE_FLOCK_GROUP, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData(emptyForm); },
    onError: (err) => setMutationError(err.message),
  });

  const [updateFlockGroup] = useMutation(UPDATE_FLOCK_GROUP, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setEditDialogOpen(false); setEditingGroup(null); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const groups = useMemo(() => allGroups.filter(g => {
    if (filters.purpose && g.purpose !== filters.purpose) return false;
    if (filters.q && !g.name?.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  }), [allGroups, filters]);

  const membershipsByGroup = useMemo(() => {
    const grouped = {};
    for (const g of allGroups) grouped[g.id] = [];
    for (const m of allMemberships) {
      if (m.groupId && grouped[m.groupId]) grouped[m.groupId].push(m);
    }
    return grouped;
  }, [allGroups, allMemberships]);

  const handleDelete = (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this group?")) return;
    deleteEntity({ variables: { type: "group", id } });
  };

  const handleEdit = (group, e) => {
    e?.stopPropagation();
    setEditingGroup(group);
    setEditFormData({
      name: group.name || "",
      purpose: group.purpose || "",
      type: group.type || "",
      startDate: group.startDate ? toLocalDateString(group.startDate) : "",
      endDate: group.endDate ? toLocalDateString(group.endDate) : "",
      description: group.description || "",
      notes: group.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editFormData.name) { setMutationError("Name is required"); return; }
    updateFlockGroup({ variables: {
      id: editingGroup.id,
      name: editFormData.name,
      purpose: editFormData.purpose || undefined,
      type: editFormData.type || undefined,
      startDate: editFormData.startDate || undefined,
      endDate: editFormData.endDate || undefined,
      description: editFormData.description || undefined,
      notes: editFormData.notes || undefined,
    }});
  };

  const handleSaveAdd = () => {
    if (!addFormData.name || !addFormData.startDate) { setMutationError("Name and start date are required"); return; }
    createFlockGroup({ variables: {
      name: addFormData.name,
      purpose: addFormData.purpose || undefined,
      type: addFormData.type || undefined,
      startDate: addFormData.startDate,
      endDate: addFormData.endDate || undefined,
      description: addFormData.description || undefined,
      notes: addFormData.notes || undefined,
    }});
  };

  const formFields = (formData, setForm) => (
    <>
      <TextField label="Name" required fullWidth value={formData.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
      <FormControl fullWidth>
        <InputLabel>Purpose</InputLabel>
        <Select value={formData.purpose} label="Purpose" onChange={(e) => setForm(p => ({ ...p, purpose: e.target.value }))}>
          {purposeOptions.map((p) => <MenuItem key={p} value={p}>{getPurposeLabel(p)}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField label="Type" fullWidth value={formData.type} onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))} />
      <TextField type="date" label="Start Date" fullWidth InputLabelProps={{ shrink: true }} value={formData.startDate} onChange={(e) => setForm(p => ({ ...p, startDate: e.target.value }))} />
      <TextField type="date" label="End Date" fullWidth InputLabelProps={{ shrink: true }} value={formData.endDate} onChange={(e) => setForm(p => ({ ...p, endDate: e.target.value }))} />
      <TextField label="Description" fullWidth multiline rows={2} value={formData.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
      <TextField label="Notes" fullWidth multiline rows={2} value={formData.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
    </>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />}
          onClick={() => { setAddFormData({ ...emptyForm, startDate: toLocalDateString(new Date()) }); setAddDialogOpen(true); }}>
          Add Group
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField label="Search" size="small" placeholder="Group name" value={filters.q}
            onChange={(e) => setFilters(p => ({ ...p, q: e.target.value }))} />
          <TextField select label="Purpose" size="small" value={filters.purpose}
            onChange={(e) => setFilters(p => ({ ...p, purpose: e.target.value }))}>
            <MenuItem value="">All Purposes</MenuItem>
            {purposeOptions.map((p) => <MenuItem key={p} value={p}>{getPurposeLabel(p)}</MenuItem>)}
          </TextField>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>
      ) : groups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">No groups found</Typography></Paper>
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          {groups.map((group) => {
            const members = membershipsByGroup[group.id] || [];
            const active = isActive(group);
            return (
              <Accordion key={group.id} expanded={expandedGroup === group.id}
                onChange={(_, isExpanded) => setExpandedGroup(isExpanded ? group.id : null)}
                disableGutters elevation={0} square
                sx={{ '&:before': { display: 'none' }, '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}
                  sx={{ '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 0, my: 0 } }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 70px auto', alignItems: 'center', width: '100%', gap: 2, pr: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{group.name}</Typography>
                    <Chip label={getPurposeLabel(group.purpose)} color={getPurposeColor(group.purpose)} size="small" sx={{ justifySelf: 'start' }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'right' }}>{members.length} birds</Typography>
                    <Chip label={active ? "Active" : "Inactive"} color={active ? "success" : "default"} size="small" variant="outlined" />
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      <IconButton size="small" onClick={(e) => handleEdit(group, e)} color="primary"><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={(e) => handleDelete(group.id, e)} color="error"><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {group.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{group.description}</Typography>}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {group.startDate ? new Date(group.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "No start"}
                    {" → "}
                    {group.endDate ? new Date(group.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "Ongoing"}
                  </Typography>
                  {members.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No birds in this group</Typography>
                  ) : (
                    <List dense disablePadding>
                      {members.map((m) => {
                        const bird = m.bird;
                        return (
                          <ListItem key={m.id} disableGutters>
                            <ListItemText
                              primary={bird?.name || bird?.tagId || `Bird ${bird?.id?.slice?.(-6) || '?'}`}
                              secondary={[bird?.species, bird?.breed, bird?.sex, m.role].filter(Boolean).join(' • ')}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  )}
                  {group.notes && <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>Notes: {group.notes}</Typography>}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Paper>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Group</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {formFields(editFormData, setEditFormData)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Group</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {formFields(addFormData, setAddFormData)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAdd} variant="contained" disabled={!addFormData.name || !addFormData.purpose}>Add Group</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GroupsPage;
