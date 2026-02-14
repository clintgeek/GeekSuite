import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useNotifications } from "./Notifications.jsx";
import {
  Stack,
  Typography,
  Chip,
  TextField,
  MenuItem,
  Button,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

export default function BirdGroupManagement({ birdId, bird, locations }) {
  const [memberships, setMemberships] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotifications();

  async function load() {
    setLoading(true);
    try {
      const [membershipsList, groupsList] = await Promise.all([
        api.getBirdGroups(birdId),
        api.listGroups(),
      ]);
      setMemberships(membershipsList);
      setGroups(groupsList);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [birdId]);

  async function handleAddToGroup() {
    if (!selectedGroup) return;
    try {
      await api.addBirdToGroup({ birdId, groupId: selectedGroup });
      setSelectedGroup("");
      load();
      showSuccess("Bird added to group");
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleRemoveFromGroup(membershipId) {
    try {
      await api.removeBirdFromGroup(membershipId);
      load();
      showSuccess("Bird removed from group");
    } catch (err) {
      showError(err.message);
    }
  }

  const availableGroups = groups.filter(
    (g) => !memberships.some((m) => m.groupId?._id === g._id)
  );

  if (loading) {
    return <Typography variant="body2">Loading groups...</Typography>;
  }

  const currentLocation = bird?.locationId;
  const locationName = locations?.find(loc => loc._id === (currentLocation?._id || currentLocation))?.name || currentLocation?.name || "Not assigned";

  return (
    <Stack spacing={3}>
      {/* Current Location */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Location
        </Typography>
        <Typography variant="body1">
          {locationName}
        </Typography>
      </Box>

      <Divider />

      {/* Current Groups */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Groups
        </Typography>
        {memberships.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Not assigned to any groups
          </Typography>
        ) : (
          <List dense>
            {memberships.map((membership) => (
              <React.Fragment key={membership._id}>
                <ListItem
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveFromGroup(membership._id)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={membership.groupId?.name || "Unknown Group"}
                    secondary={
                      membership.joinedDate
                        ? `Joined: ${new Date(membership.joinedDate).toLocaleDateString()}`
                        : null
                    }
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      {/* Add to Group */}
      {availableGroups.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Add to Group
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              select
              label="Select Group"
              size="small"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              sx={{ flexGrow: 1 }}
            >
              <MenuItem value="">—</MenuItem>
              {availableGroups.map((g) => (
                <MenuItem key={g._id} value={g._id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddToGroup}
              disabled={!selectedGroup}
            >
              Add
            </Button>
          </Stack>
        </Box>
      )}

      {availableGroups.length === 0 && memberships.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Bird is assigned to all available groups
        </Typography>
      )}
    </Stack>
  );
}