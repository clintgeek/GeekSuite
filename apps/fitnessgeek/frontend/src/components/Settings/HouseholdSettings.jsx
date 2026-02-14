import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment
} from '@mui/material';
import {
  People as PeopleIcon,
  PersonAdd as JoinIcon,
  GroupAdd as CreateIcon,
  ContentCopy as CopyIcon,
  ExitToApp as LeaveIcon,
  Check as CheckIcon,
  Restaurant as FoodIcon,
  FitnessCenter as MealsIcon
} from '@mui/icons-material';
import { settingsService } from '../../services/settingsService';

const HouseholdSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Household data
  const [householdData, setHouseholdData] = useState(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Form inputs
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    loadHouseholdSettings();
  }, []);

  const loadHouseholdSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getHouseholdSettings();
      setHouseholdData(response.data);
      setDisplayName(response.data?.display_name || '');
    } catch (err) {
      setError('Failed to load household settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!displayName.trim()) {
      setError('Please enter your display name');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const response = await settingsService.createHousehold(displayName);
      setSuccess(response.data.message);
      setShowCreateDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create household');
    } finally {
      setSaving(false);
    }
  };

  const handleJoinHousehold = async () => {
    if (!joinCode.trim()) {
      setError('Please enter the household code');
      return;
    }
    if (!displayName.trim()) {
      setError('Please enter your display name');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const response = await settingsService.joinHousehold(joinCode, displayName);
      setSuccess(response.data.message);
      setShowJoinDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to join household');
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveHousehold = async () => {
    try {
      setSaving(true);
      setError('');
      await settingsService.leaveHousehold();
      setSuccess('Successfully left household');
      setShowLeaveDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to leave household');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSharing = async (field, value) => {
    try {
      setSaving(true);
      setError('');
      await settingsService.updateHouseholdSettings({ [field]: value });
      setHouseholdData(prev => ({ ...prev, [field]: value }));
      setSuccess('Sharing settings updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError('Failed to update sharing settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = () => {
    if (householdData?.household_id) {
      navigator.clipboard.writeText(householdData.household_id);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isInHousehold = !!householdData?.household_id;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PeopleIcon color="primary" />
          <Typography variant="h6">Household Sharing</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Share food logs and meals with family members. See what they ate and easily copy their meals.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        {!isInHousehold ? (
          // Not in a household - show create/join options
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<CreateIcon />}
              onClick={() => setShowCreateDialog(true)}
            >
              Create Household
            </Button>
            <Button
              variant="outlined"
              startIcon={<JoinIcon />}
              onClick={() => setShowJoinDialog(true)}
            >
              Join Household
            </Button>
          </Box>
        ) : (
          // In a household - show settings and members
          <>
            {/* Household Code */}
            <Box sx={{
              mb: 3,
              p: 2,
              bgcolor: 'primary.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'primary.200'
            }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Household Code
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {householdData.household_id}
                </Typography>
                <IconButton size="small" onClick={handleCopyCode}>
                  {codeCopied ? <CheckIcon color="success" /> : <CopyIcon />}
                </IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Share this code with family members so they can join
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Your Sharing Settings */}
            <Typography variant="subtitle2" gutterBottom>
              Your Sharing Preferences
            </Typography>
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={householdData.share_food_logs ?? true}
                    onChange={(e) => handleUpdateSharing('share_food_logs', e.target.checked)}
                    disabled={saving}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FoodIcon fontSize="small" />
                    Share my food logs
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={householdData.share_meals ?? true}
                    onChange={(e) => handleUpdateSharing('share_meals', e.target.checked)}
                    disabled={saving}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MealsIcon fontSize="small" />
                    Share my saved meals
                  </Box>
                }
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Household Members */}
            <Typography variant="subtitle2" gutterBottom>
              Household Members
            </Typography>
            {householdData.members?.length > 0 ? (
              <List dense>
                {householdData.members.map((member) => (
                  <ListItem key={member.user_id}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        {member.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={member.display_name}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          {member.shares_food_logs && (
                            <Chip label="Food Logs" size="small" variant="outlined" />
                          )}
                          {member.shares_meals && (
                            <Chip label="Meals" size="small" variant="outlined" />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No other members yet. Share the code above to invite family members.
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Leave Household */}
            <Button
              color="error"
              startIcon={<LeaveIcon />}
              onClick={() => setShowLeaveDialog(true)}
              size="small"
            >
              Leave Household
            </Button>
          </>
        )}
      </CardContent>

      {/* Create Household Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)}>
        <DialogTitle>Create Household</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create a household to share food logs and meals with family members.
          </Typography>
          <TextField
            fullWidth
            label="Your Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Clint"
            helperText="This is how family members will see you"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateHousehold}
            disabled={saving || !displayName.trim()}
          >
            {saving ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Join Household Dialog */}
      <Dialog open={showJoinDialog} onClose={() => setShowJoinDialog(false)}>
        <DialogTitle>Join Household</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the household code shared by a family member.
          </Typography>
          <TextField
            fullWidth
            label="Household Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="e.g., A3F82B"
            sx={{ mb: 2 }}
            inputProps={{ style: { fontFamily: 'monospace', textTransform: 'uppercase' } }}
          />
          <TextField
            fullWidth
            label="Your Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Sarah"
            helperText="This is how family members will see you"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowJoinDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleJoinHousehold}
            disabled={saving || !joinCode.trim() || !displayName.trim()}
          >
            {saving ? <CircularProgress size={20} /> : 'Join'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Leave Household Dialog */}
      <Dialog open={showLeaveDialog} onClose={() => setShowLeaveDialog(false)}>
        <DialogTitle>Leave Household</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to leave this household? You will no longer be able to see other members' food logs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleLeaveHousehold}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Leave'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default HouseholdSettings;
