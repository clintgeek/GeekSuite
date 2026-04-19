import { IconButton, Tooltip } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import { useThemeMode as useTheme } from '@geeksuite/user';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        sx={{
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'rotate(180deg)',
          },
        }}
      >
        {theme === 'light' ? <Brightness4 /> : <Brightness7 />}
      </IconButton>
    </Tooltip>
  );
}
