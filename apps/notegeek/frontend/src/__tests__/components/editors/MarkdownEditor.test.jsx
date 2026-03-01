import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import MarkdownEditor from '../../../components/editors/MarkdownEditor';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// Mock window.matchMedia for Mantine and MUI
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false, // Default to mobile in this mock if we don't override
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

describe('MarkdownEditor', () => {
    let mockSetContent;

    beforeEach(() => {
        mockSetContent = vi.fn();
        vi.clearAllMocks();
    });

    it('renders editor by default when not readOnly', () => {
        render(<MarkdownEditor content="# Hello" setContent={mockSetContent} />, { wrapper: AllProviders });
        // The editor should be visible and have the content
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        expect(textbox).toBeInTheDocument();
        expect(textbox).toHaveValue('# Hello');
    });

    it('renders preview by default when readOnly', () => {
        render(<MarkdownEditor content="# Read Only Header" readOnly={true} setContent={mockSetContent} />, { wrapper: AllProviders });
        // The edit textbox should NOT be rendered
        expect(screen.queryByPlaceholderText('# Start writing markdown...')).not.toBeInTheDocument();
        // The markdown preview should render the h1
        expect(screen.getByText('Read Only Header')).toBeInTheDocument();
        // The mode toggles shouldn't be present
        expect(screen.queryByLabelText('edit mode')).not.toBeInTheDocument();
    });

    it('calls setContent when typing', () => {
        render(<MarkdownEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        fireEvent.change(textbox, { target: { value: 'New text' } });
        expect(mockSetContent).toHaveBeenCalledWith('New text');
    });

    it('can toggle to preview mode', () => {
        render(<MarkdownEditor content="**Bold text**" setContent={mockSetContent} />, { wrapper: AllProviders });

        // Editor is originally open
        expect(screen.getByPlaceholderText('# Start writing markdown...')).toBeInTheDocument();

        // Click preview toggle
        const previewToggle = screen.getByLabelText('preview mode');
        fireEvent.click(previewToggle);

        // Editor should vanish, preview should appear
        expect(screen.queryByPlaceholderText('# Start writing markdown...')).not.toBeInTheDocument();
        expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('disables input when isLoading', () => {
        render(<MarkdownEditor content="" isLoading={true} setContent={mockSetContent} />, { wrapper: AllProviders });
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        expect(textbox).toBeDisabled();
    });
});
