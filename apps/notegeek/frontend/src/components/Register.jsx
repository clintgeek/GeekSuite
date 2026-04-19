import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Typography,
    Paper,
    Alert,
    CircularProgress,
    useTheme,
    alpha,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

function Register() {
    const navigate = useNavigate();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { register, isAuthenticated, isLoading: authLoading } = useAuthStore();

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [authLoading, isAuthenticated, navigate]);

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await register();
        } catch (err) {
            setError(err.message || 'Failed to register');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                bgcolor: isDark ? '#1C1917' : '#F0EEEB',
                position: 'relative',
                overflow: 'hidden',
                px: 3,
            }}
        >
            {/* Background wash */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: '-25%',
                        left: '-15%',
                        width: '70vw',
                        height: '70vw',
                        maxWidth: 800,
                        maxHeight: 800,
                        borderRadius: '50%',
                        background: isDark
                            ? 'radial-gradient(circle, rgba(169, 157, 240, 0.06) 0%, transparent 65%)'
                            : 'radial-gradient(circle, rgba(91, 80, 168, 0.04) 0%, transparent 65%)',
                    },
                }}
            />

            <Paper
                elevation={0}
                sx={{
                    p: { xs: 4, sm: 5 },
                    width: '100%',
                    maxWidth: 420,
                    borderRadius: 4,
                    position: 'relative',
                    zIndex: 1,
                    backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.7 : 0.85),
                    backdropFilter: 'blur(24px)',
                    border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                    opacity: 0,
                    transform: 'translateY(16px)',
                    animation: mounted ? 'slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms forwards' : 'none',
                    '@keyframes slideUp': {
                        to: { opacity: 1, transform: 'translateY(0)' },
                    },
                }}
            >
                {/* Brand */}
                <Box sx={{ mb: 4 }}>
                    <Typography
                        variant="h3"
                        component="div"
                        sx={{
                            fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
                            fontWeight: 800,
                            fontSize: { xs: '2rem', sm: '2.5rem' },
                            display: 'flex',
                            alignItems: 'baseline',
                            letterSpacing: '-0.03em',
                            mb: 1,
                        }}
                    >
                        <Box component="span" sx={{ color: 'brand.note' }}>note</Box>
                        <Box component="span" sx={{ color: 'brand.geek' }}>geek</Box>
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', lineHeight: 1.6 }}
                    >
                        Create your workspace
                    </Typography>
                </Box>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 3,
                                animation: 'shake 350ms ease-out',
                                '@keyframes shake': {
                                    '0%, 100%': { transform: 'translateX(0)' },
                                    '25%': { transform: 'translateX(-6px)' },
                                    '75%': { transform: 'translateX(6px)' },
                                },
                            }}
                        >
                            {error}
                        </Alert>
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        size="large"
                        disabled={loading}
                        sx={{
                            py: 1.75,
                            fontSize: '0.95rem',
                            borderRadius: 2.5,
                            position: 'relative',
                            overflow: 'hidden',
                            '&::after': {
                                content: '""',
                                position: 'absolute',
                                inset: 0,
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)',
                                pointerEvents: 'none',
                            },
                        }}
                    >
                        {loading ? (
                            <CircularProgress size={22} color="inherit" />
                        ) : (
                            'Create account with GeekSuite'
                        )}
                    </Button>

                    {/* Divider */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            my: 3,
                            gap: 2,
                        }}
                    >
                        <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            or
                        </Typography>
                        <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                    </Box>

                    <Button
                        component={RouterLink}
                        to="/login"
                        fullWidth
                        variant="outlined"
                        disabled={loading}
                        sx={{
                            py: 1.5,
                            borderRadius: 2.5,
                            fontSize: '0.875rem',
                        }}
                    >
                        Already have an account? Sign in
                    </Button>
                </form>
            </Paper>

            {/* Version tag */}
            <Typography
                variant="caption"
                sx={{
                    position: 'absolute',
                    bottom: { xs: 16, sm: 24 },
                    color: 'text.disabled',
                    fontSize: '0.65rem',
                    letterSpacing: '0.05em',
                    opacity: 0,
                    animation: mounted ? 'fadeIn 400ms ease-out 600ms forwards' : 'none',
                    '@keyframes fadeIn': {
                        to: { opacity: 1 },
                    },
                }}
            >
                NoteGeek v1.0 &middot; GeekSuite
            </Typography>
        </Box>
    );
}

export default Register;
