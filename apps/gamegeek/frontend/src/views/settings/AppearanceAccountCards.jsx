import React from 'react';
import { Avatar, Box, Button, ToggleButton, ToggleButtonGroup, Typography, alpha } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { useThemeMode } from '@geeksuite/user';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../../utils/userDisplay';
import SettingsCard from './SettingsCard';

const toggleSx = {
  minHeight: 44,
  minWidth: 44, px: 2, textTransform: 'none', fontSize: '0.875rem', color: 'text.secondary', borderColor: 'border',
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.1), color: 'text.primary', fontWeight: 600 },
};

export function AppearanceCard() {
  const { themePreference, setThemePreference } = useThemeMode();
  return (
    <SettingsCard id="appearance" title="Appearance" description="Shared with every GeekSuite app on this device.">
      <ToggleButtonGroup
        exclusive
        aria-label="Theme"
        value={themePreference || 'auto'}
        onChange={(_e, v) => v && setThemePreference?.(v)}
        sx={{ '& .MuiToggleButton-root': toggleSx }}
      >
        <ToggleButton value="light">Light</ToggleButton>
        <ToggleButton value="dark">Dark</ToggleButton>
        <ToggleButton value="auto">Match device</ToggleButton>
      </ToggleButtonGroup>
    </SettingsCard>
  );
}

export function AccountCard({ user, onSignOut }) {
  return (
    <SettingsCard id="account" title="Account">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Avatar sx={{ bgcolor: 'background.raised', color: 'text.primary', fontWeight: 600 }}>{initialsFrom(user)}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{displayNameFrom(user)}</Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{secondaryFrom(user)}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<LogoutIcon />} onClick={onSignOut} sx={{ color: 'text.primary' }}>
          Sign out
        </Button>
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1.5 }}>
        One GeekSuite sign-in covers every app. Signing out here signs you out of all of them.
      </Typography>
    </SettingsCard>
  );
}
