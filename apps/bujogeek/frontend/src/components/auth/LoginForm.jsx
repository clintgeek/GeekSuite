import {
  Box,
  Button,
  Typography,
  Link,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'bujogeek';

const LoginForm = () => {
  const { login } = useAuth();

  return (
    <Box
      sx={{
        maxWidth: 400,
        mx: 'auto',
        mt: 8,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Typography variant="h4" component="h1" gutterBottom>
        Login
      </Typography>

      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Sign in with your baseGeek account to access {APP_NAME}.
      </Typography>

      <Button
        type="button"
        onClick={() => login()}
        variant="contained"
        size="large"
        fullWidth
      >
        Sign in
      </Button>

      <Typography variant="body2" align="center" sx={{ mt: 2 }}>
        Don't have an account?{' '}
        <Link href="/register" underline="hover">
          Register
        </Link>
      </Typography>
    </Box>
  );
};

export default LoginForm;