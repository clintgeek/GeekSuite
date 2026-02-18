import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material';
import useAuthStore from '../store/authStore';
import { LoginSplash } from '@geeksuite/ui';

function Login() {
    const navigate = useNavigate();
    const theme = useTheme();
    const { login, isAuthenticated, isLoading: authLoading } = useAuthStore();

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [authLoading, isAuthenticated, navigate]);

    const handleLogin = async () => {
        await login();
    };

    return (
        <LoginSplash
            appName="note"
            appSuffix="geek"
            taglineLine1="Think clearly."
            taglineLine2="Write boldly."
            description="A focused space for markdown, code, mind maps, and everything in between. Built for developers who think in text."
            features={['Markdown', 'Code Snippets', 'Mind Maps', 'Rich Text', 'Handwritten']}
            onLogin={handleLogin}
            loading={authLoading}
            // NoteGeek specific overrides to match original exactly
            logoColor="brand.note"
            logoSuffixColor="brand.geek"
        // Original notegeek ink colors were:
        // Dark: 169, 157, 240, 0.07 / 251, 146, 60, 0.05
        // Light: 91, 80, 168, 0.05 / 232, 89, 12, 0.04
        // The default implementation in LoginSplash uses exactly these values, so no override needed.
        />
    );
}

export default Login;