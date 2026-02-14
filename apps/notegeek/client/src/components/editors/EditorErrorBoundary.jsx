import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';

class EditorErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('EditorErrorBoundary caught error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        minHeight: 300,
                        gap: 2,
                        p: 3,
                        textAlign: 'center',
                    }}
                >
                    <ErrorOutline sx={{ fontSize: 48, color: 'error.main' }} />
                    <Typography variant="h6" color="error">
                        {this.props.title || 'Editor failed to load'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {this.props.message || 'Something went wrong. Please try again.'}
                    </Typography>
                    <Button variant="outlined" onClick={this.handleRetry}>
                        Retry
                    </Button>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default EditorErrorBoundary;
