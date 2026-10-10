import { IconButton, Tooltip } from '@mui/material';
import { Sun, Moon } from 'lucide-react';
import { useThemeMode } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeMode();

  return (
    <Tooltip title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        size="small"
        sx={{
          borderRadius: 2,
          width: 36,
          height: 36,
        }}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </IconButton>
    </Tooltip>
  );
}
