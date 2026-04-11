import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Avatar,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Person as PersonIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Logout as LogoutIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import { userService } from '../services/userService.js';
import HouseholdSettings from '../components/Settings/HouseholdSettings';
import { Surface, SectionLabel, DisplayHeading } from '../components/primitives';

const Profile = () => {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState({
    username: user?.username || user?.name || '',
    email: user?.email || '',
    firstName: '',
    lastName: '',
    age: '',
    height: '',
    gender: ''
  });

  // Load user profile data on mount
  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const userData = await userService.getProfile();
      setEditData({
        username: userData.username || '',
        email: userData.email || '',
        firstName: userData.profile?.firstName || '',
        lastName: userData.profile?.lastName || '',
        age: userData.profile?.age || '',
        height: userData.profile?.height || '',
        gender: userData.profile?.gender || ''
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  };

  const handleLogout = () => {
    logout();
  };


  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      // Prepare profile data for baseGeek
      const profileData = {
        firstName: editData.firstName,
        lastName: editData.lastName,
        age: editData.age,
        height: editData.height,
        gender: editData.gender
      };

      // Update profile in baseGeek
      const result = await userService.updateProfile(profileData);
      if (result.success) {
        setSuccess('Profile updated successfully!');
        setShowEditDialog(false);
        // Reload user profile data
        await loadUserProfile();
      } else {
        setError('Failed to update profile');
      }
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to update profile');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Account · You</SectionLabel>
        <DisplayHeading size="page">Profile</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Your identity and account. App preferences live in Settings.
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Profile Card */}
        <Grid xs={12} md={4}>
          <Surface sx={{ textAlign: 'center', py: 4 }}>
            <Avatar
              sx={{
                width: 96,
                height: 96,
                mx: 'auto',
                mb: 2,
                bgcolor: 'primary.main',
                fontFamily: "'DM Serif Display', serif",
                fontSize: '2.25rem',
                fontWeight: 400,
              }}
            >
              {(user?.username || user?.name)?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
            <Typography
              sx={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: '1.5rem',
                fontWeight: 400,
                color: 'text.primary',
                letterSpacing: '-0.01em',
                mb: 0.5,
                lineHeight: 1.15,
              }}
            >
              {editData.firstName && editData.lastName
                ? `${editData.firstName} ${editData.lastName}`
                : editData.username || user?.username || user?.name || 'User'}
            </Typography>
            <Typography
              sx={{
                color: 'text.secondary',
                fontSize: '0.875rem',
                mb: 2.5,
                wordBreak: 'break-word',
              }}
            >
              {editData.email || user?.email || ''}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => {
                setEditData({
                  username: editData.username || user?.username || user?.name || '',
                  email: editData.email || user?.email || '',
                  firstName: editData.firstName || '',
                  lastName: editData.lastName || '',
                  age: editData.age || '',
                  height: editData.height || '',
                  gender: editData.gender || '',
                });
                setShowEditDialog(true);
              }}
            >
              Edit Profile
            </Button>
          </Surface>
        </Grid>

        {/* Right column */}
        <Grid xs={12} md={8}>
          {/* Household Sharing */}
          <Box sx={{ mb: 2 }}>
            <HouseholdSettings />
          </Box>

          {/* Preferences pointer */}
          <Surface sx={{ mb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <SettingsIcon sx={{ color: 'primary.main', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      color: 'text.primary',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                    }}
                  >
                    Preferences
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                    Theme, units, notifications, and Garmin integration
                  </Typography>
                </Box>
              </Box>
              <Button component={RouterLink} to="/settings" variant="outlined" size="small">
                Open Settings
              </Button>
            </Box>
          </Surface>

          {/* Account Actions */}
          <Surface padded={false}>
            <Box
              sx={{
                px: 2.5,
                pt: 2,
                pb: 1.25,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                borderBottom: (theme) => `1px dashed ${theme.palette.divider}`,
              }}
            >
              <SecurityIcon sx={{ color: 'primary.main', fontSize: 18 }} />
              <SectionLabel>Account</SectionLabel>
            </Box>
            <List sx={{ p: 0 }}>
              <ListItem
                sx={{
                  px: 2.5,
                  py: 1.5,
                  borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <SecurityIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                      Change Password
                    </Typography>
                  }
                  secondary={
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                      Update your account password
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem
                sx={{
                  px: 2.5,
                  py: 1.5,
                  borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                      Account Information
                    </Typography>
                  }
                  secondary={
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                      View and manage your account details
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem
                component="button"
                onClick={handleLogout}
                sx={{
                  px: 2.5,
                  py: 1.5,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: 'none',
                  bgcolor: 'transparent',
                  '&:hover': {
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <LogoutIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'error.main' }}>
                      Sign out
                    </Typography>
                  }
                  secondary={
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                      End this session
                    </Typography>
                  }
                />
              </ListItem>
            </List>
          </Surface>
        </Grid>
      </Grid>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onClose={() => setShowEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Username"
            value={editData.username}
            onChange={(e) => setEditData({ ...editData, username: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={editData.email}
            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <TextField
              label="First Name"
              value={editData.firstName}
              onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
            />
            <TextField
              label="Last Name"
              value={editData.lastName}
              onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <TextField
              label="Age"
              type="number"
              value={editData.age}
              onChange={(e) => setEditData({ ...editData, age: e.target.value })}
            />
            <TextField
              label="Height"
              placeholder="5'11"
              value={editData.height}
              onChange={(e) => setEditData({ ...editData, height: e.target.value })}
            />
          </Box>
          <TextField
            fullWidth
            select
            label="Gender"
            value={editData.gender}
            onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
            sx={{ mb: 2 }}
            SelectProps={{ native: true }}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSaveProfile}
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Profile;