import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { MockedProvider } from '@apollo/client/testing';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import MarkdownEditor from '../../../components/editors/MarkdownEditor';
import { TIDY_MARKDOWN } from '../../../graphql/mutations';

const AllProviders = ({ children, mocks = [] }) => (
    <MockedProvider mocks={mocks}>
        <ThemeModeProvider>
            <MantineProvider>
                <MemoryRouter>{children}</MemoryRouter>
            </MantineProvider>
        </ThemeModeProvider>
    </MockedProvider>
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
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        expect(textbox).toBeInTheDocument();
        expect(textbox).toHaveValue('# Hello');
    });

    it('renders preview by default when readOnly', () => {
        render(<MarkdownEditor content="# Read Only Header" readOnly={true} setContent={mockSetContent} />, { wrapper: AllProviders });
        expect(screen.queryByPlaceholderText('# Start writing markdown...')).not.toBeInTheDocument();
        expect(screen.getByText('Read Only Header')).toBeInTheDocument();
        expect(screen.queryByLabelText('edit mode')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /tidy/i })).not.toBeInTheDocument();
    });

    it('calls setContent when typing', () => {
        render(<MarkdownEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        fireEvent.change(textbox, { target: { value: 'New text' } });
        expect(mockSetContent).toHaveBeenCalledWith('New text');
    });

    it('can toggle to preview mode', () => {
        render(<MarkdownEditor content="**Bold text**" setContent={mockSetContent} />, { wrapper: AllProviders });
        expect(screen.getByPlaceholderText('# Start writing markdown...')).toBeInTheDocument();

        const previewToggle = screen.getByLabelText('preview mode');
        fireEvent.click(previewToggle);

        expect(screen.queryByPlaceholderText('# Start writing markdown...')).not.toBeInTheDocument();
        expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('disables input when isLoading', () => {
        render(<MarkdownEditor content="" isLoading={true} setContent={mockSetContent} />, { wrapper: AllProviders });
        const textbox = screen.getByPlaceholderText('# Start writing markdown...');
        expect(textbox).toBeDisabled();
    });

    it('renders Tidy button and disables it when content is empty', () => {
        render(<MarkdownEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        const tidyButton = screen.getByRole('button', { name: /tidy/i });
        expect(tidyButton).toBeInTheDocument();
        expect(tidyButton).toBeDisabled();
    });

    it('enables Tidy button when content is present and triggers tidy mutation', async () => {
        const rawText = 'messy raw text point 1 point 2';
        const formattedText = '## Tidied Note\n\n- Point 1\n- Point 2';

        const mocks = [
            {
                request: {
                    query: TIDY_MARKDOWN,
                    variables: { content: rawText },
                },
                result: {
                    data: {
                        tidyMarkdown: {
                            formatted: formattedText,
                            provenance: {
                                source: 'model',
                                reason: null,
                                model: 'gemini-1.5-flash',
                                provider: 'gemini',
                                cached: false,
                                callsToday: 1,
                                cap: 50,
                            },
                        },
                    },
                },
            },
        ];

        render(
            <AllProviders mocks={mocks}>
                <MarkdownEditor content={rawText} setContent={mockSetContent} />
            </AllProviders>
        );

        const tidyButton = screen.getByRole('button', { name: /tidy/i });
        expect(tidyButton).not.toBeDisabled();

        fireEvent.click(tidyButton);

        await waitFor(() => {
            expect(mockSetContent).toHaveBeenCalledWith(formattedText);
        });
    });
});
