import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid
} from '@mui/material';
import {
  Person as PersonIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Logout as LogoutIcon,
  Edit as EditIcon,
  MonitorHeart as BPIcon,
  Palette as ThemeIcon,
  Language as LanguageIcon
} from '@mui/icons-material';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { useAuth } from '@geeksuite/auth';
import { userService } from '../services/userService.js';
import { settingsService } from '../services/settingsService.js';
import { useTheme as useAppTheme } from '../contexts/ThemeContext.jsx';
import HouseholdSettings from '../components/Settings/HouseholdSettings';

const Profile = () => {
  const { user, logout } = useAuth();
  const { themePreference, setThemePreference } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [garminEnabled, setGarminEnabled] = useState(false);
  const [garminUsername, setGarminUsername] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [savingGarmin, setSavingGarmin] = useState(false);
  const [units, setUnits] = useState({ weight: 'lbs', height: 'ft' });
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
    loadGarminSettings();
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

  const loadGarminSettings = async () => {
    try {
      const resp = await settingsService.getSettings();
      const settings = resp?.data || {};
      const g = settings.garmin || {};
      setGarminEnabled(!!g.enabled);
      setGarminUsername(g.username || '');
      setGarminPassword(''); // never display existing
      // Load units
      setUnits(settings.units || { weight: 'lbs', height: 'ft' });
    } catch (error) {
      console.error('Failed to load Garmin settings:', error);
    }
  };

  const handleThemeChange = async (newTheme) => {
    // Update the app theme context (this also updates localStorage)
    setThemePreference(newTheme);
    try {
      await settingsService.updateSettings({ theme: newTheme });
      setSuccess('Theme updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  const handleUnitChange = async (field, value) => {
    const newUnits = { ...units, [field]: value };
    setUnits(newUnits);
    try {
      await settingsService.updateSettings({ units: newUnits });
      setSuccess('Units updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      console.error('Failed to save units:', e);
    }
  };

  const handleSaveGarmin = async () => {
    try {
      setSavingGarmin(true);
      setSuccess('');
      setError('');
      const payload = {
        garmin: {
          enabled: garminEnabled,
          username: garminUsername,
          ...(garminPassword ? { password: garminPassword } : {})
        }
      };
      await settingsService.updateSettings(payload);
      setSuccess('Garmin settings saved');
      setGarminPassword('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      console.error('Failed to save Garmin settings:', e);
      setError('Failed to save Garmin settings');
      setTimeout(() => setError(''), 3000);
    } finally {
      setSavingGarmin(false);
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
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
        Profile & Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Manage your account and preferences
      </Typography>

      {/* Success/Error Messages */}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Profile Card */}
        <Grid xs={12} md={4}>
          <Card sx={{ borderRadius: 2, boxShadow: 1 }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 100,
                  height: 100,
                  mx: 'auto',
                  mb: 2,
                  bgcolor: 'primary.main',
                  fontSize: '2rem'
                }}
              >
                {(user?.username || user?.name)?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                {editData.firstName && editData.lastName
                  ? `${ editData.firstName } ${ editData.lastName }`
                  : editData.username || user?.username || user?.name || 'User'
                }
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {editData.email || user?.email || 'user@example.com'}
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
                    gender: editData.gender || ''
                  });
                  setShowEditDialog(true);
                }}
              >
                Edit Profile
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Settings */}
        <Grid xs={12} md={8}>

          {/* Garmin Integration */}
          <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 1 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <BPIcon sx={{ mr: 1 }} />
                Garmin Integration
              </Typography>

              <List>
                <ListItem>
                  <ListItemIcon>
                    <BPIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Enable Garmin"
                    secondary="Toggle Garmin Connect integration for your account"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      checked={garminEnabled}
                      onChange={(e) => setGarminEnabled(e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Garmin Username"
                    value={garminUsername}
                    onChange={(e) => setGarminUsername(e.target.value)}
                    disabled={!garminEnabled}
                  />
                </Grid>
                <Grid xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="password"
                    label="Garmin Password"
                    placeholder={garminEnabled ? 'Enter to update (leave blank to keep)' : 'Disabled'}
                    value={garminPassword}
                    onChange={(e) => setGarminPassword(e.target.value)}
                    disabled={!garminEnabled}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSaveGarmin}
                  disabled={savingGarmin}
                >
                  {savingGarmin ? <CircularProgress size={20} /> : 'Save Garmin Settings'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Household Sharing */}
          <Box sx={{ mt: 2 }}>
            <HouseholdSettings />
          </Box>

          {/* Appearance */}
          <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 1 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <ThemeIcon sx={{ mr: 1 }} />
                Appearance
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Theme</InputLabel>
                <Select
                  value={themePreference}
                  onChange={(e) => handleThemeChange(e.target.value)}
                  label="Theme"
                >
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="dark">Dark</MenuItem>
                  <MenuItem value="auto">Auto (System)</MenuItem>
                </Select>
              </FormControl>
            </CardContent>
          </Card>

          {/* Units */}
          <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 1 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <LanguageIcon sx={{ mr: 1 }} />
                Units
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Weight Units</InputLabel>
                  <Select
                    value={units.weight}
                    onChange={(e) => handleUnitChange('weight', e.target.value)}
                    label="Weight Units"
                  >
                    <MenuItem value="lbs">Pounds (lbs)</MenuItem>
                    <MenuItem value="kg">Kilograms (kg)</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Height Units</InputLabel>
                  <Select
                    value={units.height}
                    onChange={(e) => handleUnitChange('height', e.target.value)}
                    label="Height Units"
                  >
                    <MenuItem value="ft">Feet/Inches (ft)</MenuItem>
                    <MenuItem value="cm">Centimeters (cm)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 1 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <SecurityIcon sx={{ mr: 1 }} />
                Account
              </Typography>

              <List>
                <ListItem>
                  <ListItemIcon>
                    <SecurityIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Change Password"
                    secondary="Update your account password"
                  />
                </ListItem>

                <Divider />

                <ListItem>
                  <ListItemIcon>
                    <PersonIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Account Information"
                    secondary="View and manage your account details"
                  />
                </ListItem>

                <Divider />

                <ListItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Logout"
                    secondary="Sign out of your account"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
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