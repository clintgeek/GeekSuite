import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import {
  Tabs,
  Tab,
  Box,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PageCard from "../components/PageCard.jsx";
import LineChart from "../components/LineChart.jsx";
import HealthRecords from "../components/HealthRecords.jsx";
import BirdTraits from "../components/BirdTraits.jsx";
import BirdNotes from "../components/BirdNotes.jsx";
import LineageDisplay from "../components/LineageDisplay.jsx";
import BirdGroupManagement from "../components/BirdGroupManagement.jsx";
import { useNotifications } from "../components/Notifications.jsx";

const SEXES = ["pullet", "hen", "cockerel", "rooster", "unknown"];
const STATUSES = ["active", "meat run", "retired"];

export default function BirdDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState(0);
  const [bird, setBird] = useState(null);
  const [lineage, setLineage] = useState({ ancestors: [] });
  const [metric, setMetric] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [locations, setLocations] = useState([]);
  const { showSuccess, showError } = useNotifications();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [b, lin, locs] = await Promise.all([
          api.getBird(id),
          api.getBirdLineage(id),
          api.listLocations(),
        ]);
        if (!mounted) return;
        setBird(b);
        setLineage(lin || { ancestors: [] });
        setLocations(locs);

        // Only fetch production metrics for hens (not roosters, cockerels, pullets, or unknown)
        if (b.sex === "hen") {
          try {
            const m = await api.getProductionMetric(id, "overall");
            if (mounted) setMetric(m);
            const sres = await fetch(
              `/api/flockgeek/v1/metrics/production-series?birdId=${encodeURIComponent(id)}&limitDays=60`,
              {
                headers: {
                  "X-Owner-Id": localStorage.getItem("ownerId") || "demo-owner",
                },
              },
            );
            const sj = await sres.json();
            if (mounted) setSeries(sj.data.points || []);
          } catch {}
        }
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const openEditDialog = () => {
    setEditForm({
      name: bird.name || "",
      tagId: bird.tagId || "",
      sex: bird.sex || "unknown",
      breed: bird.breed || "",
      strain: bird.strain || "",
      hatchDate: bird.hatchDate ? new Date(bird.hatchDate).toISOString().split('T')[0] : "",
      origin: bird.origin || "unknown",
      status: bird.status || "active",
      statusDate: bird.statusDate ? new Date(bird.statusDate).toISOString().split('T')[0] : "",
      statusReason: bird.statusReason || "",
      locationId: bird.locationId?._id || bird.locationId || "",
      temperamentScore: bird.temperamentScore || "",
    });
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {
        name: editForm.name || undefined,
        tagId: editForm.tagId,
        sex: editForm.sex,
        breed: editForm.breed || undefined,
        strain: editForm.strain || undefined,
        hatchDate: editForm.hatchDate || undefined,
        origin: editForm.origin,
        status: editForm.status,
        statusDate: editForm.statusDate || undefined,
        statusReason: editForm.statusReason || undefined,
        locationId: editForm.locationId || null,
        temperamentScore: editForm.temperamentScore ? parseInt(editForm.temperamentScore) : undefined,
      };

      const updatedBird = await api.updateBird(id, payload);
      setBird(updatedBird);
      closeEditDialog();
      showSuccess("Bird updated successfully");
    } catch (err) {
      showError("Failed to update bird: " + err.message);
    }
  };

  const getSexColor = (sex) => {
    if (sex === "rooster" || sex === "cockerel") return "primary";
    if (sex === "hen" || sex === "pullet") return "secondary";
    return "default";
  };

  if (loading)
    return (
      <Stack alignItems="center" sx={{ py: 5 }}>
        <CircularProgress />
      </Stack>
    );
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!bird) return <Alert severity="warning">Bird not found</Alert>;

  const isLayingHen = bird.sex === "hen";

  return (
    <Stack spacing={4}>
      {/* Header Card */}
      <PageCard>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h5">
                {bird.name || bird.tagId}
              </Typography>
              <Typography variant="h6" color="text.secondary">
                {bird.tagId}
              </Typography>
              <Chip label={bird.sex || "unknown"} color={getSexColor(bird.sex)} />
            </Stack>
          </Box>
          <IconButton onClick={openEditDialog} color="primary">
            <EditIcon />
          </IconButton>
        </Box>
      </PageCard>

      {/* Egg Production Chart - Only for laying hens */}
      {isLayingHen && (
        <PageCard title="Eggs/day (last 60 days)">
          {series?.length ? (
            <LineChart data={series} />
          ) : (
            <Typography variant="body2">No recent data</Typography>
          )}
        </PageCard>
      )}

      {/* Tabs */}
      <PageCard>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="Overview" />
          <Tab label="Lineage" />
          <Tab label="Health" />
          <Tab label="Traits" />
          <Tab label="Assignments" />
          <Tab label="Notes" />
        </Tabs>
        <Box sx={{ mt: 3 }}>
          {tab === 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Breed</Typography>
                <Typography variant="body1">{bird.breed || "—"}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Strain</Typography>
                <Typography variant="body1">{bird.strain || "—"}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Hatch Date</Typography>
                <Typography variant="body1">
                  {bird.hatchDate ? new Date(bird.hatchDate).toLocaleDateString() : "—"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Origin</Typography>
                <Typography variant="body1">{bird.origin || "—"}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Status</Typography>
                <Typography variant="body1">{bird.status || "active"}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Status Date</Typography>
                <Typography variant="body1">
                  {bird.statusDate ? new Date(bird.statusDate).toLocaleDateString() : "—"}
                </Typography>
              </Grid>
              {bird.statusReason && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Status Reason</Typography>
                  <Typography variant="body1">{bird.statusReason}</Typography>
                </Grid>
              )}
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Temperament Score</Typography>
                <Typography variant="body1">{bird.temperamentScore || "—"}</Typography>
              </Grid>
              {isLayingHen && metric && (
                <>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Eggs/Day (Average)</Typography>
                    <Typography variant="body1">{metric.rateEggsPerDay}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Observations</Typography>
                    <Typography variant="body1">{metric.observationsUsed || 0}</Typography>
                  </Grid>
                </>
              )}
            </Grid>
          )}
          {tab === 1 && <LineageDisplay birdId={id} />}
          {tab === 2 && <HealthRecords birdId={id} />}
          {tab === 3 && <BirdTraits birdId={id} />}
          {tab === 4 && <BirdGroupManagement birdId={id} bird={bird} locations={locations} />}
          {tab === 5 && <BirdNotes birdId={id} />}
        </Box>
      </PageCard>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={closeEditDialog} maxWidth="md" fullWidth>
        <DialogTitle>Edit Bird</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Name"
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Tag ID"
                  value={editForm.tagId || ""}
                  onChange={(e) => setEditForm({ ...editForm, tagId: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Sex"
                  value={editForm.sex || "unknown"}
                  onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}
                  fullWidth
                >
                  {SEXES.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Breed"
                  value={editForm.breed || ""}
                  onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Strain"
                  value={editForm.strain || ""}
                  onChange={(e) => setEditForm({ ...editForm, strain: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Hatch Date"
                  type="date"
                  value={editForm.hatchDate || ""}
                  onChange={(e) => setEditForm({ ...editForm, hatchDate: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Origin"
                  value={editForm.origin || ""}
                  onChange={(e) => setEditForm({ ...editForm, origin: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Status"
                  value={editForm.status || "active"}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  fullWidth
                >
                  {STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Status Date"
                  type="date"
                  value={editForm.statusDate || ""}
                  onChange={(e) => setEditForm({ ...editForm, statusDate: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Status Reason"
                  value={editForm.statusReason || ""}
                  onChange={(e) => setEditForm({ ...editForm, statusReason: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Location"
                  value={editForm.locationId || ""}
                  onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {locations.map((loc) => (
                    <MenuItem key={loc._id} value={loc._id}>{loc.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Temperament Score (1-10)"
                  type="number"
                  value={editForm.temperamentScore || ""}
                  onChange={(e) => setEditForm({ ...editForm, temperamentScore: e.target.value })}
                  fullWidth
                  inputProps={{ min: 1, max: 10 }}
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
