import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
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
    Snackbar,
    useTheme,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import useAuthStore from '../store/authStore';

function LoginPage() {
    const theme = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [signedOutToast, setSignedOutToast] = useState(false);
    const login = useAuthStore((state) => state.login);
    const isLoading = useAuthStore((state) => state.isLoading);
    const error = useAuthStore((state) => state.error);
    const navigate = useNavigate();
    const location = useLocation();

    // Show "Signed out" toast when redirected from logout
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('signedOut') === '1') {
            setSignedOutToast(true);
            // Clean the query param from history without re-render loop
            navigate('/login', { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const success = await login(email, password);
        if (success) {
            navigate('/');
        }
    };

    return (
        /* Full-viewport cream surface — the page itself IS the paper */
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
            {/* ——— Brand splash ————————————————————————————————————————
                Wordmark in mono uppercase — the same typographic device
                used in the Header, but sized up for the auth context.
                Subline in caption/mono reinforces "writer's tool" identity.
            ——————————————————————————————————————————————————————————— */}
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

            {/* ——— Auth card —————————————————————————————————————————
                paper bg, hairline border, no shadow. 440px max.
                The design spec says "hairline border, NO heavy shadow."
            ——————————————————————————————————————————————————————————— */}
            <Paper
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 440,
                    p: { xs: 3, sm: 4 },
                    borderRadius: '10px',
                    // MuiPaper override in theme already sets 1px border + no backgroundImage;
                    // we get that for free — no need to restate it here.
                }}
            >
                {/* Card heading */}
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
                    Welcome back
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Don&rsquo;t have an account?{' '}
                    <Link
                        component={RouterLink}
                        to="/register"
                        color="primary"
                        underline="hover"
                        sx={{ fontWeight: 500 }}
                    >
                        Create one
                    </Link>
                </Typography>

                {error && (
                    <Alert
                        severity="error"
                        onClose={() => useAuthStore.setState({ error: null })}
                        sx={{ mb: 2.5 }}
                    >
                        {error}
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
                        placeholder="Your password"
                        autoComplete="current-password"
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

                    {/* Primary action — oxblood contained */}
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
                        {isLoading ? 'Signing in…' : 'Sign in'}
                    </Button>
                </Box>
            </Paper>

            {/* Footer caption — quiet, mono */}
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

            {/* Signed-out confirmation toast */}
            <Snackbar
                open={signedOutToast}
                autoHideDuration={2500}
                onClose={() => setSignedOutToast(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    severity="info"
                    onClose={() => setSignedOutToast(false)}
                    sx={{
                        bgcolor: theme.palette.glow.soft,
                        color: 'text.primary',
                        border: `1px solid ${theme.palette.border}`,
                        '& .MuiAlert-icon': { color: 'primary.main' },
                    }}
                >
                    Signed out
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default LoginPage;
