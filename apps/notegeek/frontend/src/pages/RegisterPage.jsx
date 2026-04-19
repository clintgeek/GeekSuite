import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Link,
    Alert,
    IconButton,
    InputAdornment,
    useTheme,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import useAuthStore from '../store/authStore';

function RegisterPage() {
    const theme = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formError, setFormError] = useState(null);
    const register = useAuthStore((state) => state.register);
    const isLoading = useAuthStore((state) => state.isLoading);
    const apiError = useAuthStore((state) => state.error);
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError(null);
        useAuthStore.setState({ error: null });

        if (password !== confirmPassword) {
            setFormError('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            setFormError('Password must be at least 6 characters');
            return;
        }

        const success = await register(email, password);
        if (success) {
            navigate('/');
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: 'background.default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
                py: 6,
            }}
        >
            {/* ——— Brand splash — mirrors LoginPage exactly ————————— */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography
                    component="div"
                    sx={{
                        fontFamily: theme.typography.fontFamilyMono,
                        fontWeight: 700,
                        fontSize: { xs: '1.375rem', sm: '1.625rem' },
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        lineHeight: 1,
                        mb: 1.25,
                        userSelect: 'none',
                    }}
                >
                    <Box component="span" sx={{ color: 'text.primary' }}>Note</Box>
                    <Box component="span" sx={{ color: 'primary.main' }}>Geek</Box>
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.disabled',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        display: 'block',
                    }}
                >
                    Your writing studio
                </Typography>
            </Box>

            {/* ——— Auth card ————————————————————————————————————————— */}
            <Paper
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 440,
                    p: { xs: 3, sm: 4 },
                    borderRadius: '10px',
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    sx={{
                        mb: 0.5,
                        fontSize: { xs: '1.125rem', sm: '1.25rem' },
                        fontWeight: 700,
                        letterSpacing: '-0.015em',
                    }}
                >
                    Create account
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Already have an account?{' '}
                    <Link
                        component={RouterLink}
                        to="/login"
                        color="primary"
                        underline="hover"
                        sx={{ fontWeight: 500 }}
                    >
                        Sign in
                    </Link>
                </Typography>

                {(formError || apiError) && (
                    <Alert
                        severity="error"
                        onClose={() => {
                            setFormError(null);
                            useAuthStore.setState({ error: null });
                        }}
                        sx={{ mb: 2.5 }}
                    >
                        {formError || apiError}
                    </Alert>
                )}

                <Box
                    component="form"
                    onSubmit={handleSubmit}
                    sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                    <TextField
                        label="Email"
                        type="email"
                        required
                        fullWidth
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputProps={{ 'aria-label': 'email address' }}
                    />

                    <TextField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        autoComplete="new-password"
                        inputProps={{ 'aria-label': 'password' }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label={showPassword ? 'hide password' : 'show password'}
                                        onClick={() => setShowPassword((v) => !v)}
                                        edge="end"
                                        size="small"
                                        sx={{ color: 'text.disabled' }}
                                    >
                                        {showPassword ? (
                                            <VisibilityOff sx={{ fontSize: 18 }} />
                                        ) : (
                                            <Visibility sx={{ fontSize: 18 }} />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <TextField
                        label="Confirm password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        fullWidth
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                        inputProps={{ 'aria-label': 'confirm password' }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label={showConfirmPassword ? 'hide password' : 'show password'}
                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                        edge="end"
                                        size="small"
                                        sx={{ color: 'text.disabled' }}
                                    >
                                        {showConfirmPassword ? (
                                            <VisibilityOff sx={{ fontSize: 18 }} />
                                        ) : (
                                            <Visibility sx={{ fontSize: 18 }} />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        size="large"
                        disabled={isLoading}
                        sx={{
                            mt: 0.5,
                            py: 1.25,
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            letterSpacing: '0.01em',
                        }}
                    >
                        {isLoading ? 'Creating account…' : 'Create account'}
                    </Button>
                </Box>
            </Paper>

            <Typography
                variant="caption"
                sx={{
                    mt: 4,
                    color: 'text.disabled',
                    textAlign: 'center',
                    letterSpacing: '0.04em',
                }}
            >
                Part of the GeekSuite
            </Typography>
        </Box>
    );
}

export default RegisterPage;
