import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditorErrorBoundary from '../../../components/editors/EditorErrorBoundary';

// A component that throws an error
const BuggyComponent = () => {
    throw new Error('Test error');
};

describe('EditorErrorBoundary', () => {
    beforeEach(() => {
        // Prevent React from logging expected errors to the console
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('renders children when no error occurs', () => {
        render(
            <EditorErrorBoundary>
                <div data-testid="child">Child Content</div>
            </EditorErrorBoundary>
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.queryByText('Editor failed to load')).not.toBeInTheDocument();
    });

    it('renders fallback UI when an error is caught', () => {
        render(
            <EditorErrorBoundary title="Custom Error Title" message="Custom message">
                <BuggyComponent />
            </EditorErrorBoundary>
        );
        expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
        expect(screen.getByText('Custom message')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });

    it('resets error state when Retry is clicked', () => {
        let shouldThrow = true;
        const ThrowOnceComponent = () => {
            if (shouldThrow) {
                shouldThrow = false;
                throw new Error('Test error');
            }
            return <div data-testid="child">Recovered</div>;
        };

        render(
            <EditorErrorBoundary>
                <ThrowOnceComponent />
            </EditorErrorBoundary>
        );

        // First it catches error
        expect(screen.getByText(/Editor failed to load/i)).toBeInTheDocument();

        // Click retry
        const retryButton = screen.getByRole('button', { name: /Retry/i });
        fireEvent.click(retryButton);

        // Now it should render the child since shouldThrow is false
        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.queryByText(/Editor failed to load/i)).not.toBeInTheDocument();
    });
});
