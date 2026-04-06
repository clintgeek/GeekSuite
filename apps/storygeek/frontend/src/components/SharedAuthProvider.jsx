import React, { useEffect } from 'react';
import useSharedAuthStore from '../store/sharedAuthStore';

const SharedAuthProvider = ({ children, app }) => {
    const { initialize, checkAuth } = useSharedAuthStore();

    useEffect(() => {
        const setupAuth = async () => {
            // Try to initialize with existing token
            const initialized = await initialize(app);

            // If not initialized, check auth status
            if (!initialized) {
                await checkAuth();
            }
        };

        setupAuth();
    }, [app, initialize, checkAuth]);

    return children;
};

export default SharedAuthProvider;