/**
 * FlockGeek settings — minimal by design.
 *
 * The shell grammar requires a Settings destination on both the sidebar footer
 * and the top bar account menu; FlockGeek had neither a route nor a page. This
 * is the smallest honest version: read-only account details, the suite theme
 * preference, and sign out.
 */
import React from "react";
import {
  Avatar,
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";
import { displayNameFrom, initialsFrom, secondaryFrom } from "../utils/userDisplay";

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" }
];

const SectionHeading = ({ children }) => (
  <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
    {children}
  </Typography>
);

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { themePreference, setThemePreference } = useColorMode();

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
        Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Account details and appearance for this device and every GeekSuite app.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Account</SectionHeading>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ width: 44, height: 44, bgcolor: "primary.main", color: "#1a1a18" }}>
            {initialsFrom(user)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
              {displayNameFrom(user)}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {secondaryFrom(user) || "No email on file"}
            </Typography>
          </Box>
        </Stack>
        <Typography variant="caption" sx={{ display: "block", mt: 2, color: "text.muted" }}>
          Managed by your GeekSuite account.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <SectionHeading>Appearance</SectionHeading>
        <FormControl fullWidth>
          <InputLabel id="flock-theme-label">Theme</InputLabel>
          <Select
            labelId="flock-theme-label"
            label="Theme"
            value={themePreference ?? "auto"}
            onChange={(event) => setThemePreference(event.target.value)}
          >
            {themeOptions.map(({ value, label }) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ display: "block", mt: 2, color: "text.muted" }}>
          Shared with the rest of GeekSuite. &ldquo;System&rdquo; follows your device setting.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <SectionHeading>Session</SectionHeading>
        <Divider sx={{ mb: 2 }} />
        <Button
          variant="outlined"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={logout}
        >
          Sign out
        </Button>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
