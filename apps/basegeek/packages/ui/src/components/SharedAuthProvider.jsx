import React, { useEffect } from 'react';
import useSharedAuthStore from '../store/sharedAuthStore';
import { configure as configureUserStore } from '@geeksuite/user';
import api from '../api';

// Configure @geeksuite/user with our axios instance (once)
configureUserStore(api);

const SharedAuthProvider = ({ children, app }) => {
    const { initialize, checkAuth, isAuthenticated, currentApp } = useSharedAuthStore();

    useEffect(() => {
        const setupAuth = async () => {
            // Ensure current app is set before any refresh attempts inside initialize/checkAuth
            if (!currentApp && !isAuthenticated) {
                useSharedAuthStore.setState({ currentApp: app });
            }
            // Try to initialize with existing token
            const initialized = await initialize(app);

            // If not initialized, check auth status
            if (!initialized) {
                await checkAuth();
            }
        };

        setupAuth();
    }, [app, initialize, checkAuth, isAuthenticated, currentApp]);

    return children;
};

export default SharedAuthProvider;