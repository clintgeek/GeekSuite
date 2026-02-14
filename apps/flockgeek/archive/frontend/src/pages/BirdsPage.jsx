import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useNotifications } from "../components/Notifications.jsx";
import {
  TextField,
  Button,
  Stack,
  IconButton,
  Tooltip,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Avatar,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  Tabs,
  Tab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import MaleIcon from "@mui/icons-material/Male";
import FemaleIcon from "@mui/icons-material/Female";
import PetsIcon from "@mui/icons-material/Pets";
import AddIcon from "@mui/icons-material/Add";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PageCard from "../components/PageCard.jsx";
import LineChart from "../components/LineChart.jsx";

const SEXES = ["pullet", "hen", "cockerel", "rooster", "unknown"];
const SORT_OPTIONS = [
  { value: "tagId", label: "Tag ID" },
  { value: "name", label: "Name" },
  { value: "sex", label: "Sex" },
  { value: "breed", label: "Breed" },
  { value: "group", label: "Group" },
  { value: "location", label: "Location" },
];

const BirdCard = ({
  bird,
  editing,
  editForm,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onEditFormChange,
  onClick,
  groups,
  locations,
  birdGroups,
  onAddToGroup,
  onRemoveFromGroup,
}) => {
  const getSexIcon = (sex) => {
    if (sex === "rooster" || sex === "cockerel")
      return <MaleIcon color="primary" />;
    if (sex === "hen" || sex === "pullet")
      return <FemaleIcon color="secondary" />;
    return <PetsIcon color="disabled" />;
  };

  const getSexColor = (sex) => {
    if (sex === "rooster" || sex === "cockerel") return "primary";
    if (sex === "hen" || sex === "pullet") return "secondary";
    return "default";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "success";
      case "meat run":
        return "warning";
      case "retired":
        return "info";
      default:
        return "default";
    }
  };

  const handleCardClick = (e) => {
    if (editing) return;
    if (e.target.closest("button")) return;
    onClick();
  };

  const getAccentColor = (sex) => {
    if (sex === "rooster" || sex === "cockerel") return "primary.main";
    if (sex === "hen" || sex === "pullet") return "secondary.main";
    return "grey.400";
  };

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: editing ? "default" : "pointer",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        overflow: "hidden",
        borderRadius: 2,
        "&:hover": editing
          ? {}
          : {
              transform: "translateY(-4px)",
              boxShadow: 6,
            },
      }}
      onClick={handleCardClick}
    >
      {/* Colored Header Bar */}
      <Box
        sx={{
          bgcolor: getAccentColor(bird.sex),
          color: "white",
          px: 2,
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography
          variant="h6"
          component="div"
          noWrap
          sx={{
            fontWeight: 600,
            fontSize: "1.1rem",
            color: "white",
          }}
        >
          {bird.name || "Unnamed"}
        </Typography>
        {!editing && (
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              sx={{
                color: "white",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.2)",
                  transform: "scale(1.1)",
                },
                transition: "all 0.2s",
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <CardContent sx={{ flexGrow: 1, pb: 1, pt: 2 }}>
        <Stack spacing={2}>

          {/* Body */}
          {editing ? (
            <Stack spacing={2}>
              <TextField
                label="Name"
                size="small"
                value={editForm.name || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, name: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Tag ID"
                size="small"
                value={editForm.tagId || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, tagId: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Breed"
                size="small"
                value={editForm.breed || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, breed: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Origin"
                size="small"
                value={editForm.origin || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, origin: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Hatch Date"
                type="date"
                size="small"
                value={editForm.hatchDate || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, hatchDate: e.target.value })
                }
                fullWidth
              />
              <TextField
                select
                label="Sex"
                size="small"
                value={editForm.sex || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, sex: e.target.value })
                }
                fullWidth
              >
                {SEXES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Status"
                size="small"
                value={editForm.status || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, status: e.target.value })
                }
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                {["active", "meat run", "retired"].map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>

              {/* Location */}
              <TextField
                select
                label="Location"
                size="small"
                value={editForm.locationId || ""}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, locationId: e.target.value || null })
                }
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                {locations.map((loc) => (
                  <MenuItem key={loc._id} value={loc._id}>
                    {loc.name}
                  </MenuItem>
                ))}
              </TextField>

              {/* Add to group */}
              {groups && groups.length > 0 && (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Add to Group:
                  </Typography>
                  <TextField
                    select
                    label="Select Group"
                    size="small"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        onAddToGroup(e.target.value);
                      }
                    }}
                    fullWidth
                  >
                    <MenuItem value="">—</MenuItem>
                    {groups
                      .filter(
                        (g) =>
                          !birdGroups?.some(
                            (m) => m.groupId?._id === g._id
                          )
                      )
                      .map((g) => (
                        <MenuItem key={g._id} value={g._id}>
                          {g.name}
                        </MenuItem>
                      ))}
                  </TextField>
                </Stack>
              )}
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {/* Tag ID */}
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  letterSpacing: "0.5px",
                }}
              >
                {bird.tagId}
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{ gap: 0.5 }}
              >
                <Chip
                  label={bird.sex || "unknown"}
                  size="small"
                  color={getSexColor(bird.sex)}
                  variant="outlined"
                  sx={{
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                />
                {bird.breed && (
                  <Chip
                    label={bird.breed}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontWeight: 500,
                      borderColor: "grey.400",
                    }}
                  />
                )}
                {bird.locationId && (
                  <Chip
                    label={bird.locationId.name}
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{
                      fontWeight: 500,
                    }}
                  />
                )}
                {bird.status && (
                  <Chip
                    label={bird.status}
                    size="small"
                    color={getStatusColor(bird.status)}
                    variant="filled"
                    sx={{
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  />
                )}
              </Stack>

              {/* Display groups */}
              {birdGroups && birdGroups.length > 0 && (
                <Box
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    p: 1,
                    mt: 0.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      display: "block",
                      mb: 0.5,
                    }}
                  >
                    Groups:
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
                    {birdGroups.map((membership) => (
                      <Chip
                        key={membership._id}
                        label={membership.groupId?.name || "Unknown"}
                        size="small"
                        color="info"
                        variant="outlined"
                        onDelete={(e) => {
                          e.stopPropagation();
                          onRemoveFromGroup(membership._id);
                        }}
                        sx={{
                          fontWeight: 500,
                          "& .MuiChip-deleteIcon": {
                            fontSize: "16px",
                            "&:hover": {
                              color: "error.main",
                            },
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}

          {editing && (
            <CardActions sx={{ pt: 0, justifyContent: "space-between" }}>
              <Box>
                <Button size="small" onClick={onSave} startIcon={<SaveIcon />}>
                  Save
                </Button>
                <Button
                  size="small"
                  onClick={onCancel}
                  startIcon={<CancelIcon />}
                >
                  Cancel
                </Button>
              </Box>
              <Button
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                startIcon={<DeleteIcon />}
              >
                Delete
              </Button>
            </CardActions>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default function BirdsPage() {
  const [birds, setBirds] = useState([]);
  const [form, setForm] = useState({
    tagId: "",
    name: "",
    breed: "",
    origin: "unknown",
    hatchDate: "",
    sex: "unknown",
    groupId: "",
    locationId: "",
  });
  const [filters, setFilters] = useState({ q: "", sex: "", groupId: "", locationId: "" });
  const [sortBy, setSortBy] = useState("tagId");
  const [statusTab, setStatusTab] = useState("active");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", status: "" });
  const [productionData, setProductionData] = useState([]);
  const [groups, setGroups] = useState([]);
  const [locations, setLocations] = useState([]);
  const [birdGroups, setBirdGroups] = useState({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkAddDialogOpen, setBulkAddDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    startingTagId: "",
    count: 1,
    breed: "",
    origin: "unknown",
    hatchDate: "",
    sex: "unknown",
    groupId: "",
    locationId: "",
  });
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotifications();

  async function load() {
    const items = await api.listBirds({
      q: filters.q,
      sex: filters.sex,
      locationId: filters.locationId,
      limit: 1000 // Fetch up to 1000 birds
    });
    setBirds(items);

    try {
      const data = await api.getProductionMetric("all", "recent");
      setProductionData(data.weeks || []);
    } catch {}

    // Load groups
    try {
      const groupsList = await api.listGroups();
      setGroups(groupsList);
    } catch {}

    // Load locations
    try {
      const locationsList = await api.listLocations();
      setLocations(locationsList);
    } catch {}

    // Load bird groups for all birds
    try {
      const groupsMap = {};
      await Promise.all(
        items.map(async (bird) => {
          const memberships = await api.getBirdGroups(bird._id);
          groupsMap[bird._id] = memberships;
        })
      );
      setBirdGroups(groupsMap);
    } catch {}
  }

  useEffect(() => {
    load();
  }, [filters.q, filters.sex, filters.locationId]);

  const sortBirds = (birds) =>
    [...birds].sort((a, b) => {
      let aVal, bVal;

      if (sortBy === "group") {
        // Sort by first group name
        const aGroups = birdGroups[a._id] || [];
        const bGroups = birdGroups[b._id] || [];
        aVal = aGroups[0]?.groupId?.name || "";
        bVal = bGroups[0]?.groupId?.name || "";
        return aVal.localeCompare(bVal);
      } else if (sortBy === "location") {
        // Sort by location name
        aVal = a.locationId?.name || "";
        bVal = b.locationId?.name || "";
        return aVal.localeCompare(bVal);
      } else if (sortBy === "tagId") {
        // Natural sort for tag IDs (handles numbers properly)
        aVal = a.tagId || "";
        bVal = b.tagId || "";
        return aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        // Default sorting by field
        aVal = a[sortBy] || "";
        bVal = b[sortBy] || "";
        return aVal.localeCompare(bVal);
      }
    });

  async function onCreate(e) {
    e.preventDefault();
    if (!form.tagId) return;
    const existing = birds.find((b) => b.tagId === form.tagId);
    if (existing) {
      showError(`A bird with tag ID "${form.tagId}" already exists`);
      return;
    }
    try {
      const newBird = await api.createBird({
        tagId: form.tagId,
        name: form.name || undefined,
        breed: form.breed || undefined,
        origin: form.origin || "unknown",
        hatchDate: form.hatchDate
          ? new Date(form.hatchDate).toISOString()
          : undefined,
        sex: form.sex || "unknown",
        locationId: form.locationId || undefined,
      });

      // Add bird to group if selected
      if (form.groupId) {
        try {
          await api.addBirdToGroup({ birdId: newBird._id, groupId: form.groupId });
        } catch (err) {
          showError(`Bird added but failed to add to group: ${err.message}`);
        }
      }

      setForm({
        tagId: "",
        name: "",
        breed: "",
        origin: "unknown",
        hatchDate: "",
        sex: "unknown",
        groupId: "",
        locationId: "",
      });
      setAddDialogOpen(false);
      load();
      showSuccess("Bird added successfully");
    } catch (err) {
      showError(err.message);
    }
  }

  async function onBulkCreate(e) {
    e.preventDefault();
    if (!bulkForm.startingTagId || bulkForm.count < 1) return;

    try {
      // Parse starting tag ID to extract numeric part
      const startingTag = bulkForm.startingTagId;
      const match = startingTag.match(/^(.*?)(\d+)$/);

      if (!match) {
        showError("Starting Tag ID must end with a number (e.g., 'B100' or '100')");
        return;
      }

      const prefix = match[1];
      const startNum = parseInt(match[2], 10);

      // Check for existing tag IDs
      const tagsToCreate = [];
      for (let i = 0; i < bulkForm.count; i++) {
        const tagId = `${prefix}${startNum + i}`;
        const existing = birds.find((b) => b.tagId === tagId);
        if (existing) {
          showError(`A bird with tag ID "${tagId}" already exists`);
          return;
        }
        tagsToCreate.push(tagId);
      }

      // Create all birds
      const createdBirds = [];
      for (const tagId of tagsToCreate) {
        const newBird = await api.createBird({
          tagId,
          breed: bulkForm.breed || undefined,
          origin: bulkForm.origin || "unknown",
          hatchDate: bulkForm.hatchDate
            ? new Date(bulkForm.hatchDate).toISOString()
            : undefined,
          sex: bulkForm.sex || "unknown",
          locationId: bulkForm.locationId || undefined,
        });
        createdBirds.push(newBird);
      }

      // Add all birds to group if selected
      if (bulkForm.groupId) {
        await Promise.all(
          createdBirds.map((bird) =>
            api.addBirdToGroup({ birdId: bird._id, groupId: bulkForm.groupId })
          )
        );
      }

      setBulkForm({
        startingTagId: "",
        count: 1,
        breed: "",
        origin: "unknown",
        hatchDate: "",
        sex: "unknown",
        groupId: "",
        locationId: "",
      });
      setBulkAddDialogOpen(false);
      load();
      showSuccess(`Successfully added ${bulkForm.count} birds`);
    } catch (err) {
      showError(err.message);
    }
  }

  async function onDelete(id) {
    try {
      await api.deleteBird(id);
      load();
      showSuccess("Bird deleted successfully");
    } catch (err) {
      showError(err.message);
    }
  }

  function startEdit(bird) {
    setEditing(bird._id);
    setEditForm({
      tagId: bird.tagId || "",
      name: bird.name || "",
      status: bird.status || "",
      breed: bird.breed || "",
      origin: bird.origin || "unknown",
      hatchDate: bird.hatchDate
        ? new Date(bird.hatchDate).toISOString().slice(0, 10)
        : "",
      sex: bird.sex || "unknown",
      locationId: bird.locationId?._id || "",
    });
  }

  async function saveEdit(id) {
    try {
      await api.updateBird(id, {
        tagId: editForm.tagId,
        name: editForm.name,
        status: editForm.status || undefined,
        breed: editForm.breed || undefined,
        origin: editForm.origin || "unknown",
        hatchDate: editForm.hatchDate
          ? new Date(editForm.hatchDate).toISOString()
          : undefined,
        sex: editForm.sex || "unknown",
        locationId: editForm.locationId || null,
      });
      setEditing(null);
      load();
      showSuccess("Bird updated successfully");
    } catch (err) {
      showError(err.message);
    }
  }

  async function addBirdToGroup(birdId, groupId) {
    try {
      await api.addBirdToGroup({ birdId, groupId });
      load();
      showSuccess("Bird added to group");
    } catch (err) {
      showError(err.message);
    }
  }

  async function removeBirdFromGroup(membershipId) {
    try {
      await api.removeBirdFromGroup(membershipId);
      load();
      showSuccess("Bird removed from group");
    } catch (err) {
      showError(err.message);
    }
  }

  // Filter birds by group (client-side since groups are many-to-many)
  const filteredBirds = filters.groupId
    ? birds.filter((bird) => {
        const memberships = birdGroups[bird._id] || [];
        return memberships.some((m) => m.groupId?._id === filters.groupId);
      })
    : birds;

  // Filter by status tab
  const tabFilteredBirds = filteredBirds.filter((bird) => {
    if (statusTab === "active") {
      return bird.status === "active" || !bird.status;
    } else if (statusTab === "meat_run") {
      return bird.status === "meat run";
    } else if (statusTab === "retired") {
      return bird.status === "retired";
    }
    return true;
  });

  const sortedBirds = sortBirds(tabFilteredBirds);

  return (
    <Stack spacing={4}>

      {productionData.length > 0 && (
        <PageCard title="Egg Production Trend">
          <Box sx={{ height: 200 }}>
            <LineChart
              data={productionData.map((d) => ({ x: d.week, y: d.eggs }))}
              xLabel="Week"
              yLabel="Eggs"
              color="#6098CC"
            />
          </Box>
        </PageCard>
      )}

      <PageCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
          <TextField
            label="Search birds..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            sx={{ flexGrow: 1 }}
            placeholder="Search by name or tag ID"
          />
          <TextField
            select
            label="Sex"
            value={filters.sex}
            onChange={(e) => setFilters({ ...filters, sex: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Sexes</MenuItem>
            {SEXES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Group"
            value={filters.groupId}
            onChange={(e) => setFilters({ ...filters, groupId: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Groups</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g._id} value={g._id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Location"
            value={filters.locationId}
            onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Locations</MenuItem>
            {locations.map((loc) => (
              <MenuItem key={loc._id} value={loc._id}>
                {loc.name}
              </MenuItem>
            ))}
          </TextField>

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              label="Sort By"
            >
              {SORT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </PageCard>

      <PageCard>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={statusTab} onChange={(e, v) => setStatusTab(v)}>
            <Tab label={`Active (${birds.filter(b => b.status === "active" || !b.status).length})`} value="active" />
            <Tab label={`Meat Run (${birds.filter(b => b.status === "meat run").length})`} value="meat_run" />
            <Tab label={`Retired (${birds.filter(b => b.status === "retired").length})`} value="retired" />
          </Tabs>
        </Box>
        <Grid container spacing={3}>
          {sortedBirds.map((bird) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={bird._id}>
              <BirdCard
                bird={bird}
                editing={editing === bird._id}
                editForm={editForm}
                onEdit={() => startEdit(bird)}
                onSave={() => saveEdit(bird._id)}
                onCancel={() => setEditing(null)}
                onDelete={() => onDelete(bird._id)}
                onEditFormChange={setEditForm}
                onClick={() => navigate(`/birds/${bird._id}`)}
                groups={groups}
                locations={locations}
                birdGroups={birdGroups[bird._id] || []}
                onAddToGroup={(groupId) => addBirdToGroup(bird._id, groupId)}
                onRemoveFromGroup={removeBirdFromGroup}
              />
            </Grid>
          ))}
          {sortedBirds.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: "center", py: 4 }}>
                <PetsIcon
                  sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
                />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No birds found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add your first bird using the form above
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </PageCard>

      {/* SpeedDial for adding birds */}
      <SpeedDial
        ariaLabel="Add birds"
        sx={{ position: "fixed", bottom: 24, right: 24 }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          icon={<PersonAddIcon />}
          tooltipTitle="Add Single Bird"
          onClick={() => setAddDialogOpen(true)}
        />
        <SpeedDialAction
          icon={<GroupAddIcon />}
          tooltipTitle="Bulk Add Birds"
          onClick={() => setBulkAddDialogOpen(true)}
        />
      </SpeedDial>

      {/* Add Bird Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add New Bird</DialogTitle>
        <form onSubmit={onCreate}>
          <DialogContent>
            <Stack spacing={3} sx={{ pt: 1 }}>
              <TextField
                label="Tag ID"
                value={form.tagId}
                onChange={(e) => setForm({ ...form, tagId: e.target.value })}
                required
                fullWidth
                autoFocus
              />
              <TextField
                label="Name (Optional)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                fullWidth
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Breed (Optional)"
                  value={form.breed}
                  onChange={(e) => setForm({ ...form, breed: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Origin (Optional)"
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Hatch Date (Optional)"
                  type="date"
                  value={form.hatchDate}
                  onChange={(e) =>
                    setForm({ ...form, hatchDate: e.target.value })
                  }
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <TextField
                select
                label="Sex"
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value })}
                fullWidth
              >
                {SEXES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Group (Optional)"
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {groups.map((g) => (
                  <MenuItem key={g._id} value={g._id}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Location (Optional)"
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {locations.map((loc) => (
                  <MenuItem key={loc._id} value={loc._id}>
                    {loc.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Add Bird
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Bulk Add Birds Dialog */}
      <Dialog
        open={bulkAddDialogOpen}
        onClose={() => setBulkAddDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Bulk Add Birds</DialogTitle>
        <form onSubmit={onBulkCreate}>
          <DialogContent>
            <Stack spacing={3} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Add multiple birds with consecutive band numbers. For example, starting with "B100" and count of 10 will create birds B100, B101, B102, ... B109.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Starting Tag ID"
                  value={bulkForm.startingTagId}
                  onChange={(e) => setBulkForm({ ...bulkForm, startingTagId: e.target.value })}
                  required
                  fullWidth
                  autoFocus
                  helperText="Must end with a number (e.g., 'B100' or '100')"
                />
                <TextField
                  label="Count"
                  type="number"
                  value={bulkForm.count}
                  onChange={(e) => setBulkForm({ ...bulkForm, count: parseInt(e.target.value) || 1 })}
                  required
                  fullWidth
                  inputProps={{ min: 1, max: 100 }}
                  helperText="How many birds to create"
                />
              </Stack>

              {bulkForm.startingTagId && bulkForm.count > 0 && (
                <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Preview:</strong> Will create birds with tag IDs:{" "}
                    {(() => {
                      const match = bulkForm.startingTagId.match(/^(.*?)(\d+)$/);
                      if (!match) return "Invalid format";
                      const prefix = match[1];
                      const startNum = parseInt(match[2], 10);
                      const preview = [];
                      for (let i = 0; i < Math.min(bulkForm.count, 5); i++) {
                        preview.push(`${prefix}${startNum + i}`);
                      }
                      return preview.join(", ") + (bulkForm.count > 5 ? ", ..." : "");
                    })()}
                  </Typography>
                </Box>
              )}

              <Divider />

              <Typography variant="subtitle2" color="text.secondary">
                Common Properties (applied to all birds)
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Breed (Optional)"
                  value={bulkForm.breed}
                  onChange={(e) => setBulkForm({ ...bulkForm, breed: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Origin (Optional)"
                  value={bulkForm.origin}
                  onChange={(e) => setBulkForm({ ...bulkForm, origin: e.target.value })}
                  fullWidth
                />
              </Stack>

              <TextField
                label="Hatch Date (Optional)"
                type="date"
                value={bulkForm.hatchDate}
                onChange={(e) => setBulkForm({ ...bulkForm, hatchDate: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                select
                label="Sex"
                value={bulkForm.sex}
                onChange={(e) => setBulkForm({ ...bulkForm, sex: e.target.value })}
                fullWidth
              >
                {SEXES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Group (Optional)"
                value={bulkForm.groupId}
                onChange={(e) => setBulkForm({ ...bulkForm, groupId: e.target.value })}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {groups.map((g) => (
                  <MenuItem key={g._id} value={g._id}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Location (Optional)"
                value={bulkForm.locationId}
                onChange={(e) => setBulkForm({ ...bulkForm, locationId: e.target.value })}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {locations.map((loc) => (
                  <MenuItem key={loc._id} value={loc._id}>
                    {loc.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBulkAddDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Add {bulkForm.count} Bird{bulkForm.count !== 1 ? "s" : ""}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Stack>
  );
}
