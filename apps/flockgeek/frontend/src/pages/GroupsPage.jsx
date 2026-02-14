import React, { useState, useEffect } from "react";
import {
  Container,
  Paper,
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
  Select,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Stack
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import client from "../services/apiClient";

const GroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [membershipsByGroup, setMembershipsByGroup] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [filters, setFilters] = useState({
    purpose: "",
    q: ""
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    purpose: "",
    type: "",
    startDate: "",
    endDate: "",
    description: "",
    notes: ""
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: "",
    purpose: "",
    type: "",
    startDate: "",
    endDate: "",
    description: "",
    notes: ""
  });

  const fetchGroups = async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        sortBy: "name",
        sortOrder: "asc",
        limit: 100,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      };

      const response = await client.get("/groups", { params });
      const grps = response.data.data.groups;
      setGroups(grps);

      // Fetch active memberships for all groups
      const membershipsResponse = await client.get("/group-memberships", { params: { active: "true" } });
      const allMemberships = membershipsResponse.data.data?.memberships || [];

      // Group memberships by groupId
      const grouped = {};
      for (const grp of grps) {
        const grpId = grp._id?.toString?.() || grp._id;
        grouped[grpId] = [];
      }
      for (const m of allMemberships) {
        const grpId = m.groupId?._id?.toString?.() || m.groupId?.toString?.() || m.groupId;
        if (grpId && grouped[grpId]) {
          grouped[grpId].push(m);
        }
      }
      setMembershipsByGroup(grouped);
    } catch (err) {
      setError(err.message || "Failed to fetch groups");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [filters]);

  const handleDeleteGroup = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this group?")) return;

    try {
      await client.delete(`/groups/${id}`);
      fetchGroups();
    } catch (err) {
      setError(err.message || "Failed to delete group");
    }
  };

  const handleEditGroup = (group, e) => {
    e?.stopPropagation();
    setEditingGroup(group);
    setEditFormData({
      name: group.name || "",
      purpose: group.purpose || "",
      type: group.type || "",
      startDate: group.startDate ? new Date(group.startDate).toISOString().split('T')[0] : "",
      endDate: group.endDate ? new Date(group.endDate).toISOString().split('T')[0] : "",
      description: group.description || "",
      notes: group.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingGroup(null);
    setEditFormData({
      name: "",
      purpose: "",
      type: "",
      startDate: "",
      endDate: "",
      description: "",
      notes: ""
    });
  };

  const handleSaveEdit = async () => {
    try {
      const dataToSend = {
        ...editFormData,
        startDate: editFormData.startDate ? new Date(editFormData.startDate).toISOString() : null,
        endDate: editFormData.endDate ? new Date(editFormData.endDate).toISOString() : null
      };

      await client.put(`/groups/${editingGroup._id}`, dataToSend);
      setEditDialogOpen(false);
      fetchGroups();
    } catch (err) {
      setError(err.message || "Failed to update group");
    }
  };

  const handleAddGroup = () => {
    setAddFormData({
      name: "",
      purpose: "",
      type: "",
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      description: "",
      notes: ""
    });
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setAddFormData({
      name: "",
      purpose: "",
      type: "",
      startDate: "",
      endDate: "",
      description: "",
      notes: ""
    });
  };

  const handleSaveAdd = async () => {
    try {
      const dataToSend = {
        ...addFormData,
        startDate: addFormData.startDate ? new Date(addFormData.startDate).toISOString() : null,
        endDate: addFormData.endDate ? new Date(addFormData.endDate).toISOString() : null
      };

      await client.post("/groups", dataToSend);
      setAddDialogOpen(false);
      fetchGroups();
    } catch (err) {
      setError(err.message || "Failed to create group");
    }
  };

  const handleAccordionChange = (groupId) => (event, isExpanded) => {
    setExpandedGroup(isExpanded ? groupId : null);
  };

  const purposeOptions = ["layer_flock", "breeder_flock", "meat_flock", "brooder", "other"];

  const getPurposeLabel = (purpose) => {
    return purpose.replace(/_/g, " ");
  };

  const getPurposeColor = (purpose) => {
    switch (purpose) {
      case "layer_flock":
        return "primary";
      case "breeder_flock":
        return "info";
      case "meat_flock":
        return "warning";
      case "brooder":
        return "success";
      default:
        return "default";
    }
  };

  const isActive = (group) => {
    const now = new Date();
    const start = group.startDate ? new Date(group.startDate) : null;
    const end = group.endDate ? new Date(group.endDate) : null;

    if (!start) return false;
    if (start > now) return false;
    if (end && end < now) return false;
    return true;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <div></div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddGroup}
        >
          Add Group
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
          <TextField
            label="Search"
            size="small"
            placeholder="Group name"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
            }}
          />

          <TextField
            select
            label="Purpose"
            size="small"
            value={filters.purpose}
            onChange={(e) => {
              setFilters({ ...filters, purpose: e.target.value });
            }}
          >
            <MenuItem value="">All Purposes</MenuItem>
            {purposeOptions.map((p) => (
              <MenuItem key={p} value={p}>
                {getPurposeLabel(p)}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {/* Groups Accordion List */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No groups found</Typography>
        </Paper>
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          {groups.map((group) => {
            const grpId = group._id?.toString?.() || group._id;
            const members = membershipsByGroup[grpId] || [];
            const memberCount = members.length;
            const active = isActive(group);

            return (
              <Accordion
                key={group._id}
                expanded={expandedGroup === group._id}
                onChange={handleAccordionChange(group._id)}
                disableGutters
                elevation={0}
                square
                sx={{
                  '&:before': { display: 'none' },
                  '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' }
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 0,
                      my: 0
                    }
                  }}
                >
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 110px 70px 70px auto',
                    alignItems: 'center',
                    width: '100%',
                    gap: 2,
                    pr: 1
                  }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {group.name}
                    </Typography>
                    <Chip
                      label={getPurposeLabel(group.purpose)}
                      color={getPurposeColor(group.purpose)}
                      size="small"
                      sx={{ justifySelf: 'start' }}
                    />
                    <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'right' }}>
                      {memberCount} birds
                    </Typography>
                    <Chip
                      label={active ? "Active" : "Inactive"}
                      color={active ? "success" : "default"}
                      size="small"
                      variant="outlined"
                    />
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleEditGroup(group, e)}
                        color="primary"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => handleDeleteGroup(group._id, e)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {group.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {group.description}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {group.startDate ? new Date(group.startDate).toLocaleDateString() : "No start"}
                    {" → "}
                    {group.endDate ? new Date(group.endDate).toLocaleDateString() : "Ongoing"}
                  </Typography>
                  {members.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No birds in this group
                    </Typography>
                  ) : (
                    <List dense disablePadding>
                      {members.map((m) => {
                        const bird = m.birdId;
                        return (
                          <ListItem key={m._id} disableGutters>
                            <ListItemText
                              primary={bird?.name || bird?.tagId || `Bird ${bird?._id?.slice?.(-6) || '?'}`}
                              secondary={[bird?.species, bird?.breed, bird?.sex, m.role].filter(Boolean).join(' • ')}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  )}
                  {group.notes && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                      Notes: {group.notes}
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Paper>
      )}

      {/* Edit Group Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Group</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Purpose</InputLabel>
              <Select
                value={editFormData.purpose}
                label="Purpose"
                onChange={(e) => setEditFormData({ ...editFormData, purpose: e.target.value })}
              >
                {purposeOptions.map((purpose) => (
                  <MenuItem key={purpose} value={purpose}>
                    {getPurposeLabel(purpose)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Type"
              value={editFormData.type}
              onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
              fullWidth
            />
            <TextField
              label="Start Date"
              type="date"
              value={editFormData.startDate}
              onChange={(e) => setEditFormData({ ...editFormData, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date"
              type="date"
              value={editFormData.endDate}
              onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Description"
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
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

      {/* Add Group Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Group</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Name *"
              value={addFormData.name}
              onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Purpose *</InputLabel>
              <Select
                value={addFormData.purpose}
                label="Purpose"
                onChange={(e) => setAddFormData({ ...addFormData, purpose: e.target.value })}
                required
              >
                {purposeOptions.map((purpose) => (
                  <MenuItem key={purpose} value={purpose}>
                    {getPurposeLabel(purpose)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Type"
              value={addFormData.type}
              onChange={(e) => setAddFormData({ ...addFormData, type: e.target.value })}
              fullWidth
            />
            <TextField
              label="Start Date"
              type="date"
              value={addFormData.startDate}
              onChange={(e) => setAddFormData({ ...addFormData, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date"
              type="date"
              value={addFormData.endDate}
              onChange={(e) => setAddFormData({ ...addFormData, endDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Description"
              value={addFormData.description}
              onChange={(e) => setAddFormData({ ...addFormData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
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
            disabled={!addFormData.name || !addFormData.purpose}
          >
            Add Group
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GroupsPage;
