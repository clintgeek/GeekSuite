import {
  Box,
  Button,
  Typography,
  Link
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'bujogeek';

const RegisterForm = () => {
  const { register } = useAuth();

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
        Register
      </Typography>

      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Create your account in baseGeek to use {APP_NAME}.
      </Typography>

      <Button
        type="button"
        onClick={() => register()}
        variant="contained"
        size="large"
        fullWidth
      >
        Create account
      </Button>

      <Typography variant="body2" align="center" sx={{ mt: 2 }}>
        Already have an account?{' '}
        <Link href="/login" underline="hover">
          Login
        </Link>
      </Typography>
    </Box>
  );
};

export default RegisterForm;