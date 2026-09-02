/**
 * BookGeek top bar — the old `Header.jsx`, moved inside the shell.
 *
 * `Header` was an `AppBar` rendered as a *sibling above* `GeekShell`, which is
 * why the sidebar started 60px down the page and why BookGeek had no mobile
 * hamburger to give one. This renders as `GeekShell topBar` instead, so the
 * sidebar column runs full height and `GeekTopBar` supplies the mobile
 * hamburger from the shell context.
 *
 * The brand moved to the sidebar's brand block; the left slot now carries the
 * page title. "Add book" is an app action, so it sits in `actions`, left of
 * the fixed suite cluster (theme → switcher → account).
 */
import React from 'react';
import { Button, alpha, useTheme } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useThemeMode } from '@geeksuite/user';
import { GeekTopBar } from '@geeksuite/ui';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { viewTitle } from './navConfig';

const TopBar = ({ user, activeView, setActiveView, setAddBookOpen, onSignOut }) => {
  const theme = useTheme();
  const { theme: mode, toggleTheme } = useThemeMode();

  return (
    <GeekTopBar
      elevation={0}
      title={viewTitle(activeView)}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp="bookgeek"
      actions={
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddBookOpen(true)}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            px: 2,
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' }
          }}
        >
          Add book
        </Button>
      }
      account={
        user
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => setActiveView("profile"),
              onSignOut
            }
          : undefined
      }
      sx={{
        // BookGeek identity: flat paper band with a hairline rule, and the
        // serif wordmark's face on the page title.
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': {
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontWeight: 400,
          fontSize: '1.25rem',
          letterSpacing: '-0.02em'
        },
        '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"]': {
          color: 'text.primary',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
        }
      }}
    />
  );
};

export default TopBar;
