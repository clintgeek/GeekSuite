import { createTheme } from '@mui/material';

// GeekSuite Design Language Colors
const geekSuiteColors = {
  primary: {
    main: '#6098CC', // GeekSuite primary blue
    light: '#7BB3F0',
    dark: '#2E5C8A',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#1976D2',
    light: '#2196F3',
    dark: '#1565C0',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#B00020',
  },
  success: {
    main: '#4CAF50',
  },
  warning: {
    main: '#FFC107',
  },
  info: {
    main: '#2196F3',
  },
};

// Light Theme
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: geekSuiteColors.primary,
    secondary: geekSuiteColors.secondary,
    background: {
      default: '#f5f5f5', // Very light grey for view background
      paper: '#ffffff',
      codeEditor: '#f5f5f5',
      mindMap: '#f8f9fa',
    },
    text: {
      primary: '#212121', // Dark grey for text
      secondary: '#757575',
      disabled: '#BDBDBD',
      placeholder: 'rgba(117, 117, 117, 0.7)',
    },
    error: geekSuiteColors.error,
    success: geekSuiteColors.success,
    warning: geekSuiteColors.warning,
    info: geekSuiteColors.info,
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 500,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    h4: {
      fontSize: '1.125rem',
      fontWeight: 500,
    },
    h5: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    h6: {
      fontSize: '0.875rem',
      fontWeight: 500,
      letterSpacing: '0.02em',
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.75rem',
    },
    code: {
      fontFamily: '"Roboto Mono", monospace',
      fontSize: '0.9rem',
    },
  },
  spacing: 8, // Base spacing unit of 8px
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          height: 60, // GeekSuite standard header height
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          '&:hover': {
            backgroundColor: 'rgba(96, 152, 204, 0.04)',
          },
          '&.Mui-disabled': {
            opacity: 0.38,
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
          '&:hover': {
            boxShadow: '0px 4px 8px -2px rgba(0,0,0,0.1), 0px 6px 7px 0px rgba(0,0,0,0.07), 0px 2px 12px 0px rgba(0,0,0,0.06)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: 220,
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(0, 0, 0, 0.12)',
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(96, 152, 204, 0.1)',
          color: '#6098CC',
          '&:hover': {
            backgroundColor: 'rgba(96, 152, 204, 0.2)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
});

// Dark Theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: geekSuiteColors.primary,
    secondary: geekSuiteColors.secondary,
    background: {
      default: '#121212', // Very dark grey
      paper: '#1e1e1e', // Dark grey
      codeEditor: '#1a1a1a',
      mindMap: '#1e1e1e',
    },
    text: {
      primary: '#E0E0E0', // Light grey for text
      secondary: '#B0B0B0',
      disabled: '#666666',
      placeholder: 'rgba(176, 176, 176, 0.7)',
    },
    error: geekSuiteColors.error,
    success: geekSuiteColors.success,
    warning: geekSuiteColors.warning,
    info: geekSuiteColors.info,
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 500,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    h4: {
      fontSize: '1.125rem',
      fontWeight: 500,
    },
    h5: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    h6: {
      fontSize: '0.875rem',
      fontWeight: 500,
      letterSpacing: '0.02em',
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.75rem',
    },
    code: {
      fontFamily: '"Roboto Mono", monospace',
      fontSize: '0.9rem',
    },
  },
  spacing: 8, // Base spacing unit of 8px
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          height: 60, // GeekSuite standard header height
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          '&:hover': {
            backgroundColor: 'rgba(96, 152, 204, 0.08)',
          },
          '&.Mui-disabled': {
            opacity: 0.38,
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.3), 0px 4px 5px 0px rgba(0,0,0,0.2), 0px 1px 10px 0px rgba(0,0,0,0.2)',
          '&:hover': {
            boxShadow: '0px 4px 8px -2px rgba(0,0,0,0.3), 0px 6px 7px 0px rgba(0,0,0,0.2), 0px 2px 12px 0px rgba(0,0,0,0.2)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: 220,
          backgroundColor: '#1e1e1e',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(96, 152, 204, 0.2)',
          color: '#7BB3F0',
          '&:hover': {
            backgroundColor: 'rgba(96, 152, 204, 0.3)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
});

export { lightTheme, darkTheme };
export default lightTheme;