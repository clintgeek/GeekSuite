import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#6098CC' }, // dusty blue header per GeekSuite
    secondary: { main: '#7B61FF' },
    background: { default: '#F5F5F5', paper: '#FFFFFF' },
    text: { primary: '#212121', secondary: '#757575' },
    success: { main: '#28A745' },
    error: { main: '#DC3545' },
    warning: { main: '#FFC107' },
    info: { main: '#2196f3' }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700 },
    h2: { fontSize: '2rem', fontWeight: 600 },
    h3: { fontSize: '1.5rem', fontWeight: 500 },
    body1: { fontSize: '1rem', fontWeight: 400 },
    body2: { fontSize: '0.875rem', fontWeight: 400 }
  },
  shape: { borderRadius: 16 },
  spacing: 8,
  components: {
    MuiAppBar: { styleOverrides: { root: { height: 60, borderRadius: 0 } } },
    MuiToolbar: { styleOverrides: { root: { minHeight: 60 } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 16 } } }
  }
});

export default theme;
