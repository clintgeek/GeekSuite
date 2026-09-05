import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import {
  Container, TableCell, TableRow, Button, Box, Typography,
  Alert, TextField, MenuItem, Chip, FormControl, InputLabel, Select,
  Accordion, AccordionSummary, AccordionDetails, Grid
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ResponsiveTable from "../components/primitives/ResponsiveTable";
import LedgerDialog from "../components/primitives/LedgerDialog";
import { toLocalDateString } from "../utils/dateUtils";
import { GET_BIRDS, GET_LOCATIONS, GET_FLOCK_GROUPS, GET_GROUP_MEMBERSHIPS } from "../graphql/queries";
import { CREATE_BIRD, UPDATE_BIRD, DELETE_ENTITY } from "../graphql/mutations";

const statusOptions = ["active", "meat run", "retired"];
const sexOptions = ["pullet", "hen", "cockerel", "rooster", "unknown"];
const speciesOptions = ["chicken", "duck", "turkey", "quail", "other"];
const originOptions = ["own_egg", "purchased", "traded", "rescued", "unknown"];

const getStatusColor = (status) => ({ active: "success", "meat run": "warning", retired: "default" }[status] ?? "default");

const getAgeText = (dateValue) => {
  if (!dateValue) return "Unknown";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  const now = new Date();
  if (parsed > now) return "Unknown";
  const diffDays = Math.floor((now - parsed) / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365.25);
  if (years >= 1) {
    const months = Math.floor(Math.max(diffDays - Math.floor(years * 365.25), 0) / 30.44);
    return months > 0 ? `${years}y ${months}m` : `${years}y`;
  }
  const months = Math.floor(diffDays / 30.44);
  if (months >= 1) {
    const days = Math.max(diffDays - Math.floor(months * 30.44), 0);
    return days > 0 ? `${months}m ${days}d` : `${months}m`;
  }
  return `${diffDays}d`;
};

const emptyEditForm = {
  tagId: "", name: "", sex: "", breed: "", hatchDate: "", status: "",
  species: "", strain: "", cross: "false", origin: "", foundationStock: "false",
  sireId: "", damId: "", locationId: "", temperamentScore: "",
  statusDate: "", statusReason: "", notes: ""
};

const buildEditFormData = (bird) => {
  if (!bird) return { ...emptyEditForm };
  return {
    tagId: bird.tagId || "",
    name: bird.name || "",
    sex: bird.sex || "",
    breed: bird.breed || "",
    hatchDate: bird.hatchDate ? toLocalDateString(bird.hatchDate) : "",
    status: bird.status || "",
    species: bird.species || "",
    strain: bird.strain || "",
    cross: bird.cross ? "true" : "false",
    origin: bird.origin || "",
    foundationStock: bird.foundationStock ? "true" : "false",
    sireId: bird.sireId || "",
    damId: bird.damId || "",
    locationId: bird.locationId || "",
    temperamentScore: bird.temperamentScore ?? "",
    statusDate: bird.statusDate ? toLocalDateString(bird.statusDate) : "",
    statusReason: bird.statusReason || "",
    notes: bird.notes || ""
  };
};

const defaultAddForm = {
  tagId: "", name: "", sex: "", breed: "", hatchDate: "", status: "active",
  species: "chicken", strain: "", cross: false, origin: "unknown",
  foundationStock: false, sireId: "", damId: "", locationId: "",
  temperamentScore: "", statusDate: "", statusReason: "", notes: ""
};

const BirdsPage = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("tagId");
  const [sortOrder, setSortOrder] = useState("asc");
  const [filters, setFilters] = useState({ status: "", sex: "", breed: "", q: "" });
  const [mutationError, setMutationError] = useState("");

  const [expandedBirdId, setExpandedBirdId] = useState(null);
  const [editingBird, setEditingBird] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyEditForm);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(defaultAddForm);
  // Below `md` there is no row to expand, so Edit opens the same form as a
  // full-screen dialog instead of an accordion (MOBILE_UI_PLAN.md §4).
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: birdsData, loading, error } = useQuery(GET_BIRDS);
  const { data: locData } = useQuery(GET_LOCATIONS);
  const { data: groupsData } = useQuery(GET_FLOCK_GROUPS);
  const { data: membershipsData } = useQuery(GET_GROUP_MEMBERSHIPS, { variables: { activeOnly: true } });

  const allBirds = birdsData?.birds || [];
  const locations = locData?.flockLocations || [];
  const allGroups = groupsData?.flockGroups || [];
  const allMemberships = membershipsData?.groupMemberships || [];

  const refetchList = ['GetBirds'];

  const [createBird] = useMutation(CREATE_BIRD, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setAddDialogOpen(false); setAddFormData(defaultAddForm); },
    onError: (err) => setMutationError(err.message),
  });

  const [updateBird] = useMutation(UPDATE_BIRD, {
    refetchQueries: refetchList, awaitRefetchQueries: true,
    onCompleted: () => { setExpandedBirdId(null); setEditingBird(null); setEditDialogOpen(false); },
    onError: (err) => setMutationError(err.message),
  });

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    refetchQueries: refetchList,
    onError: (err) => setMutationError(err.message),
  });

  const allBreeds = useMemo(() => [...new Set(allBirds.map(b => b.breed).filter(Boolean))].sort(), [allBirds]);

  const groupsById = useMemo(() => Object.fromEntries(allGroups.map(g => [g.id, g])), [allGroups]);

  const membershipsByBird = useMemo(() => {
    const map = {};
    for (const m of allMemberships) {
      if (!map[m.birdId]) map[m.birdId] = [];
      map[m.birdId].push(m);
    }
    return map;
  }, [allMemberships]);

  const filtered = useMemo(() => allBirds.filter(b => {
    if (filters.status && b.status !== filters.status) return false;
    if (filters.sex && b.sex !== filters.sex) return false;
    if (filters.breed && b.breed !== filters.breed) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!b.name?.toLowerCase().includes(q) && !b.tagId?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allBirds, filters]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? ""; const bv = b[sortBy] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  }), [filtered, sortBy, sortOrder]);

  const paginated = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = (col) => { setSortOrder(sortBy === col && sortOrder === "asc" ? "desc" : "asc"); setSortBy(col); setPage(0); };

  const handleAccordionChange = (birdId) => (_, isExpanded) => {
    if (isExpanded) {
      const bird = allBirds.find(b => b.id === birdId);
      setEditingBird(bird || null);
      setEditFormData(buildEditFormData(bird));
      setExpandedBirdId(birdId);
    } else {
      setExpandedBirdId(null);
      setEditingBird(null);
      setEditFormData(emptyEditForm);
    }
  };

  const handleCancelEdit = () => { setExpandedBirdId(null); setEditingBird(null); setEditDialogOpen(false); setEditFormData(emptyEditForm); };

  const handleSaveEdit = () => {
    updateBird({ variables: {
      id: editingBird.id,
      tagId: editFormData.tagId || undefined,
      name: editFormData.name || undefined,
      sex: editFormData.sex || undefined,
      status: editFormData.status || undefined,
      notes: editFormData.notes || undefined,
      locationId: editFormData.locationId || undefined,
    }});
  };

  const handleDelete = (id) => {
    if (!window.confirm("Delete this bird?")) return;
    deleteEntity({ variables: { type: "bird", id } });
    setExpandedBirdId(null);
    setEditingBird(null);
    setEditDialogOpen(false);
  };

  /** Phone Edit: load the row into the same edit form the accordion uses. */
  const openMobileEdit = (bird) => {
    setEditingBird(bird);
    setEditFormData(buildEditFormData(bird));
    setEditDialogOpen(true);
  };

  const handleSaveAdd = () => {
    if (!addFormData.tagId || !addFormData.sex) { setMutationError("Tag ID and sex are required"); return; }
    createBird({ variables: {
      tagId: addFormData.tagId,
      name: addFormData.name || undefined,
      sex: addFormData.sex,
      breed: addFormData.breed || undefined,
      status: addFormData.status || undefined,
      notes: addFormData.notes || undefined,
      hatchDate: addFormData.hatchDate || undefined,
      origin: addFormData.origin || undefined,
    }});
  };


  const setEF = (key, val) => setEditFormData(p => ({ ...p, [key]: val }));

  const asDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-";
  const titleCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  const originLabel = (value) => value ? value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '-';

  /**
   * The ledger's six columns. At `md`+ they are only the table's *headers* —
   * each body row is the expanding accordion below, handed to
   * `ResponsiveTable` as `renderDesktopRow`. Below `md` they are the card:
   * Tag ID titles it, the rest are its label/value list.
   */
  const columns = [
    { key: "tagId", label: "Tag ID", primary: true },
    { key: "name", label: "Name", render: (b) => b.name || "-" },
    { key: "sex", label: "Sex", render: (b) => <Box component="span" sx={{ textTransform: 'capitalize' }}>{b.sex || "-"}</Box> },
    { key: "breed", label: "Breed", render: (b) => b.breed || "-" },
    { key: "hatchDate", label: "Hatch Date", render: (b) => asDate(b.hatchDate) },
    { key: "status", label: "Status", render: (b) => <Chip label={b.status} color={getStatusColor(b.status)} size="small" /> }
  ];

  const rowActions = (bird) => [
    { id: "edit", label: "Edit bird", icon: <EditIcon />, onClick: () => openMobileEdit(bird) },
    { id: "delete", label: "Delete bird", icon: <DeleteIcon />, color: "error", onClick: () => handleDelete(bird.id) }
  ];

  /**
   * The six row-level fields. On desktop they are edited in place in the
   * accordion summary; the phone's dialog needs them as ordinary form rows.
   */
  const birdSummaryFields = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Tag ID" value={editFormData.tagId} onChange={(e) => setEF('tagId', e.target.value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Name" value={editFormData.name} onChange={(e) => setEF('name', e.target.value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>Sex</InputLabel>
          <Select value={editFormData.sex} label="Sex" onChange={(e) => setEF('sex', e.target.value)}>
            {sexOptions.map(sex => <MenuItem key={sex} value={sex}>{titleCase(sex)}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>Breed</InputLabel>
          <Select value={editFormData.breed} label="Breed" onChange={(e) => setEF('breed', e.target.value)}>
            <MenuItem value=""><em>None</em></MenuItem>
            {allBreeds.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Hatch Date" type="date" value={editFormData.hatchDate}
          onChange={(e) => setEF('hatchDate', e.target.value)} InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>Status</InputLabel>
          <Select value={editFormData.status} label="Status" onChange={(e) => setEF('status', e.target.value)}>
            {statusOptions.map(st => <MenuItem key={st} value={st}>{titleCase(st)}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );

  /**
   * Everything below the row: details, lineage, memberships, status, notes.
   * `editing` decides whether each field is an input or a read-only pair, and
   * both surfaces — the desktop accordion and the phone's edit dialog — render
   * this one function, so the form can never drift between them.
   */
  const birdDetailSections = (bird, editing) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Bird Details</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <Typography variant="subtitle2" color="text.secondary">Age</Typography>
            <Typography variant="body1">{getAgeText(editing ? editFormData.hatchDate : bird.hatchDate)}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel>Species</InputLabel>
                <Select value={editFormData.species} label="Species" onChange={(e) => setEF('species', e.target.value)}>
                  {speciesOptions.map(sp => <MenuItem key={sp} value={sp}>{titleCase(sp)}</MenuItem>)}
                </Select>
              </FormControl>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Species</Typography>
                <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>{bird.species || '-'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <TextField fullWidth label="Strain" value={editFormData.strain} onChange={(e) => setEF('strain', e.target.value)} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Strain</Typography>
                <Typography variant="body1">{bird.strain || '-'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel>Cross</InputLabel>
                <Select value={editFormData.cross} label="Cross" onChange={(e) => setEF('cross', e.target.value)}>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Cross</Typography>
                <Typography variant="body1">{bird.cross ? 'Yes' : 'No'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel>Origin</InputLabel>
                <Select value={editFormData.origin} label="Origin" onChange={(e) => setEF('origin', e.target.value)}>
                  {originOptions.map(o => <MenuItem key={o} value={o}>{originLabel(o)}</MenuItem>)}
                </Select>
              </FormControl>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Origin</Typography>
                <Typography variant="body1">{originLabel(bird.origin)}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel>Foundation Stock</InputLabel>
                <Select value={editFormData.foundationStock} label="Foundation Stock" onChange={(e) => setEF('foundationStock', e.target.value)}>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Foundation Stock</Typography>
                <Typography variant="body1">{bird.foundationStock ? 'Yes' : 'No'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <FormControl fullWidth>
                <InputLabel>Location</InputLabel>
                <Select value={editFormData.locationId} label="Location" onChange={(e) => setEF('locationId', e.target.value)}>
                  <MenuItem value=""><em>Unassigned</em></MenuItem>
                  {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                </Select>
              </FormControl>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Location</Typography>
                <Typography variant="body1">{locations.find(l => l.id === bird.locationId)?.name || 'Unassigned'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {editing ? (
              <TextField fullWidth label="Temperament Score" type="number"
                value={editFormData.temperamentScore} onChange={(e) => setEF('temperamentScore', e.target.value)} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Temperament</Typography>
                <Typography variant="body1">{bird.temperamentScore ?? '-'}</Typography>
              </>
            )}
          </Grid>
        </Grid>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Lineage</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            {editing ? (
              <TextField fullWidth label="Sire ID" value={editFormData.sireId} onChange={(e) => setEF('sireId', e.target.value)} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Sire</Typography>
                <Typography variant="body1">{bird.sireId || '-'}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            {editing ? (
              <TextField fullWidth label="Dam ID" value={editFormData.damId} onChange={(e) => setEF('damId', e.target.value)} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Dam</Typography>
                <Typography variant="body1">{bird.damId || '-'}</Typography>
              </>
            )}
          </Grid>
        </Grid>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Group Memberships</Typography>
        {(membershipsByBird[bird.id] || []).length > 0 ? (
          (membershipsByBird[bird.id] || []).map((m) => {
            const group = groupsById[m.groupId];
            return (
              <Chip key={m.id}
                label={`${group?.name || 'Unknown Group'} (${group?.purpose || 'Unknown Purpose'})`}
                variant="outlined" size="small" sx={{ mr: 1, mb: 1 }} />
            );
          })
        ) : (
          <Typography variant="body2" color="text.secondary">No group memberships</Typography>
        )}
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Status Details</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            {editing ? (
              <TextField fullWidth label="Status Date" type="date"
                value={editFormData.statusDate} onChange={(e) => setEF('statusDate', e.target.value)}
                InputLabelProps={{ shrink: true }} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Status Date</Typography>
                <Typography variant="body1">{asDate(bird.statusDate)}</Typography>
              </>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            {editing ? (
              <TextField fullWidth label="Status Reason" value={editFormData.statusReason} onChange={(e) => setEF('statusReason', e.target.value)} />
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary">Status Reason</Typography>
                <Typography variant="body1">{bird.statusReason || '-'}</Typography>
              </>
            )}
          </Grid>
        </Grid>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Notes</Typography>
        {editing ? (
          <TextField fullWidth multiline minRows={3} value={editFormData.notes} onChange={(e) => setEF('notes', e.target.value)} />
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{bird.notes || '-'}</Typography>
        )}
      </Box>
    </Box>
  );

  /**
   * The filter fields. `ResponsiveTable` frames them: a Paper of columns at
   * `md`+, a sheet behind a `[Filters · n]` pill below it.
   */
  const filterFields = (
    <>
      <TextField label="Search" size="small" placeholder="Name or Tag ID" value={filters.q}
        onChange={(e) => { setFilters(p => ({ ...p, q: e.target.value })); setPage(0); }} />
      <TextField select label="Status" size="small" value={filters.status}
        onChange={(e) => { setFilters(p => ({ ...p, status: e.target.value })); setPage(0); }}>
        <MenuItem value="">All Statuses</MenuItem>
        {statusOptions.map(st => <MenuItem key={st} value={st}>{st}</MenuItem>)}
      </TextField>
      <TextField select label="Sex" size="small" value={filters.sex}
        onChange={(e) => { setFilters(p => ({ ...p, sex: e.target.value })); setPage(0); }}>
        <MenuItem value="">All Sexes</MenuItem>
        {sexOptions.map(sx => <MenuItem key={sx} value={sx}>{sx}</MenuItem>)}
      </TextField>
      <TextField select label="Breed" size="small" value={filters.breed}
        onChange={(e) => { setFilters(p => ({ ...p, breed: e.target.value })); setPage(0); }}>
        <MenuItem value="">All Breeds</MenuItem>
        {allBreeds.map(breed => <MenuItem key={breed} value={breed}>{breed}</MenuItem>)}
      </TextField>
    </>
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  /** The `md`+ row: the expanding, edit-in-place accordion, unchanged. */
  const renderBirdRow = (bird) => {
    const isExpanded = expandedBirdId === bird.id;
    return (
      <TableRow key={bird.id} hover sx={{ cursor: 'pointer' }}>
        <TableCell colSpan={columns.length} sx={{ p: 0 }}>
          <Accordion expanded={isExpanded} onChange={handleAccordionChange(bird.id)}
            sx={{ '&.Mui-expanded': { margin: 0 } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2, gap: 2 }}>
                <Box sx={{ minWidth: 80, flexShrink: 0 }}>
                  {isExpanded ? (
                    <TextField label="Tag ID" size="small" value={editFormData.tagId}
                      onChange={(e) => setEF('tagId', e.target.value)}
                      onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} />
                  ) : (
                    <Typography variant="subtitle1"><strong>{bird.tagId}</strong></Typography>
                  )}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 160 }}>
                  {isExpanded ? (
                    <TextField label="Name" size="small" value={editFormData.name}
                      onChange={(e) => setEF('name', e.target.value)}
                      onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} />
                  ) : (
                    <Typography variant="body1">{bird.name || "-"}</Typography>
                  )}
                </Box>
                <Box sx={{ minWidth: 140 }}>
                  {isExpanded ? (
                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                      <InputLabel>Sex</InputLabel>
                      <Select value={editFormData.sex} label="Sex" onChange={(e) => setEF('sex', e.target.value)} onClick={(e) => e.stopPropagation()}>
                        {sexOptions.map(sex => <MenuItem key={sex} value={sex}>{titleCase(sex)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{bird.sex}</Typography>
                  )}
                </Box>
                <Box sx={{ minWidth: 180 }}>
                  {isExpanded ? (
                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                      <InputLabel>Breed</InputLabel>
                      <Select value={editFormData.breed} label="Breed" onChange={(e) => setEF('breed', e.target.value)} onClick={(e) => e.stopPropagation()}>
                        <MenuItem value=""><em>None</em></MenuItem>
                        {allBreeds.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography variant="body2">{bird.breed || "-"}</Typography>
                  )}
                </Box>
                <Box sx={{ minWidth: 160 }}>
                  {isExpanded ? (
                    <TextField label="Hatch Date" type="date" size="small" value={editFormData.hatchDate}
                      onChange={(e) => setEF('hatchDate', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} />
                  ) : (
                    <Typography variant="body2">{asDate(bird.hatchDate)}</Typography>
                  )}
                </Box>
                <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center' }}>
                  {isExpanded ? (
                    <FormControl fullWidth size="small" onClick={(e) => e.stopPropagation()}>
                      <InputLabel>Status</InputLabel>
                      <Select value={editFormData.status} label="Status" onChange={(e) => setEF('status', e.target.value)} onClick={(e) => e.stopPropagation()}>
                        {statusOptions.map(st => <MenuItem key={st} value={st}>{titleCase(st)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : (
                    <Chip label={bird.status} color={getStatusColor(bird.status)} size="small" sx={{ flexShrink: 0 }} />
                  )}
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ pt: 2 }}>
                {birdDetailSections(bird, isExpanded)}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                  <Button onClick={() => handleDelete(bird.id)} color="error" startIcon={<DeleteIcon />}>Delete</Button>
                  <Button onClick={handleCancelEdit}>Cancel</Button>
                  <Button onClick={handleSaveEdit} variant="contained">Save</Button>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Container maxWidth="lg" disableGutters sx={{ py: { xs: 0, md: 4 }, px: { xs: 0, md: 2 } }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddFormData(defaultAddForm); setAddDialogOpen(true); }}>
          Add Bird
        </Button>
      </Box>

      {(error || mutationError) && <Alert severity="error" sx={{ mb: 2 }}>{error?.message || mutationError}</Alert>}

      <ResponsiveTable
        filters={filterFields}
        filterCount={activeFilterCount}
        columns={columns}
        rows={paginated}
        rowActions={rowActions}
        rowLabel={(b) => b.name || b.tagId}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        loading={loading}
        emptyMessage="No birds found"
        renderDesktopRow={renderBirdRow}
        page={page}
        rowsPerPage={rowsPerPage}
        count={sorted.length}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      />

      {/* Phone edit — the accordion's form, full-screen. Same state, same
          `handleSaveEdit`, so a bird edited here and a bird edited on the
          desktop row take the exact same path. */}
      <LedgerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title={editingBird ? `Edit ${editingBird.name || editingBird.tagId}` : "Edit bird"}
        maxWidth="md"
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
        primaryAction={<Button type="submit" form="bird-edit-form" variant="contained">Save</Button>}
      >
        {editingBird && (
          <Box
            component="form"
            id="bird-edit-form"
            onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
            sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            {birdSummaryFields()}
            {birdDetailSections(editingBird, true)}
          </Box>
        )}
      </LedgerDialog>

      {/* Add Bird — full-screen below `sm`; the two-column grid is already
          `xs={12} sm={6}`, so it stacks on a phone. */}
      <LedgerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add new bird"
        maxWidth="md"
        secondaryAction={<Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>}
        primaryAction={
          <Button type="submit" form="bird-add-form" variant="contained" disabled={!addFormData.tagId || !addFormData.sex}>Add Bird</Button>
        }
      >
        <Box component="form" id="bird-add-form" onSubmit={(e) => { e.preventDefault(); handleSaveAdd(); }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Tag ID" required fullWidth value={addFormData.tagId}
                onChange={(e) => setAddFormData(p => ({ ...p, tagId: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Name" fullWidth value={addFormData.name}
                onChange={(e) => setAddFormData(p => ({ ...p, name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Sex *</InputLabel>
                <Select value={addFormData.sex} label="Sex" onChange={(e) => setAddFormData(p => ({ ...p, sex: e.target.value }))}>
                  {sexOptions.filter(sx => sx !== "unknown").map(sx => <MenuItem key={sx} value={sx}>{titleCase(sx)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Breed</InputLabel>
                <Select value={addFormData.breed} label="Breed" onChange={(e) => setAddFormData(p => ({ ...p, breed: e.target.value }))}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {allBreeds.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Hatch Date" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={addFormData.hatchDate} onChange={(e) => setAddFormData(p => ({ ...p, hatchDate: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={addFormData.status} label="Status" onChange={(e) => setAddFormData(p => ({ ...p, status: e.target.value }))}>
                  {statusOptions.map(st => <MenuItem key={st} value={st}>{titleCase(st)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}><Typography variant="h6" sx={{ mt: 1, mb: 0 }}>More Details</Typography></Grid>
            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth>
                <InputLabel>Species</InputLabel>
                <Select value={addFormData.species} label="Species" onChange={(e) => setAddFormData(p => ({ ...p, species: e.target.value }))}>
                  {speciesOptions.map(sp => <MenuItem key={sp} value={sp}>{titleCase(sp)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Strain" fullWidth value={addFormData.strain}
                onChange={(e) => setAddFormData(p => ({ ...p, strain: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth>
                <InputLabel>Origin</InputLabel>
                <Select value={addFormData.origin} label="Origin" onChange={(e) => setAddFormData(p => ({ ...p, origin: e.target.value }))}>
                  {originOptions.map(o => <MenuItem key={o} value={o}>{originLabel(o)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Notes" fullWidth multiline rows={3} value={addFormData.notes}
                onChange={(e) => setAddFormData(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </Box>
      </LedgerDialog>
    </Container>
  );
};

export default BirdsPage;
