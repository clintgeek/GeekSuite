import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
} from '@mui/material';

function SettingsSection({ title, children }) {
  return (
    <Box sx={{
      p: 3,
      borderRadius: '12px',
      border: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'background.paper',
    }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </Box>
    </Box>
  );
}

function Settings() {
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>Settings</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        Configure baseGeek infrastructure and preferences
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
        <SettingsSection title="General">
          <TextField fullWidth label="API Base URL" defaultValue="http://localhost:3000" size="small" />
          <TextField fullWidth label="Default Database Port" type="number" defaultValue="27017" size="small" />
          <FormControlLabel control={<Switch defaultChecked />} label="Enable Auto-Connect" />
        </SettingsSection>

        <SettingsSection title="Security">
          <TextField fullWidth label="JWT Secret" type="password" size="small" />
          <FormControlLabel control={<Switch defaultChecked />} label="Enable SSL/TLS" />
          <FormControlLabel control={<Switch />} label="Require Authentication" />
        </SettingsSection>
      </Box>

      <SettingsSection title="Backups">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField fullWidth label="Backup Directory" defaultValue="/backups" size="small" />
          <TextField fullWidth label="Backup Frequency (hours)" type="number" defaultValue="24" size="small" />
        </Box>
        <FormControlLabel control={<Switch defaultChecked />} label="Enable Automatic Backups" />
      </SettingsSection>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" color="primary">
          Save Settings
        </Button>
      </Box>
    </Box>
  );
}

export default Settings;