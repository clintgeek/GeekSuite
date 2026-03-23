import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import { useUser, useAppPreferences } from "@geeksuite/user";
import { useAuth } from "../contexts/AuthContext";
import { useColorMode } from "../theme/AppThemeProvider";

const NATIVE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

const SettingsPage = () => {
  const { identity } = useUser();
  const { logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const { preferences: appPrefs, updateAppPreferences } = useAppPreferences("babelgeek");

  const nativeLanguage = appPrefs?.nativeLanguage ?? "en";

  const handleNativeLanguageChange = async (event) => {
    await updateAppPreferences({ nativeLanguage: event.target.value });
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>
        Settings
      </Typography>

      <Stack spacing={3}>
        {/* Account */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              Account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Signed in as <strong>{identity?.email || "—"}</strong>
            </Typography>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              Appearance
            </Typography>
            <Button
              variant="outlined"
              onClick={toggleColorMode}
              startIcon={mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
              fullWidth
            >
              {mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
            </Button>
          </CardContent>
        </Card>

        {/* Language Preferences */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              Language Preferences
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="native-lang-label">Native language</InputLabel>
              <Select
                labelId="native-lang-label"
                value={nativeLanguage}
                label="Native language"
                onChange={handleNativeLanguageChange}
              >
                {NATIVE_LANGUAGES.map(({ code, label }) => (
                  <MenuItem key={code} value={code}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Translations and hints will be shown in this language.
            </Typography>
          </CardContent>
        </Card>

        <Divider />

        {/* Sign out */}
        <Box>
          <Button
            variant="contained"
            color="error"
            onClick={logout}
            startIcon={<LogoutIcon />}
            fullWidth
          >
            Sign out
          </Button>
        </Box>
      </Stack>
    </Container>
  );
};

export default SettingsPage;
