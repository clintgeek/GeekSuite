import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import CodeEditor from '../../../components/editors/CodeEditor';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

describe('CodeEditor', () => {
    let mockSetContent;

    beforeEach(() => {
        mockSetContent = vi.fn();
        vi.clearAllMocks();
    });

    it('renders with default language javascript and empty string if no content', () => {
        render(<CodeEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        const select = screen.getByLabelText(/Language/i);
        expect(select).toHaveTextContent('JavaScript');
        const textarea = screen.getByPlaceholderText('// Write your code here...');
        expect(textarea).toHaveValue('');
    });

    it('parses JSON content properly', () => {
        const jsonContent = JSON.stringify({ language: 'python', code: 'print("hello")' });
        render(<CodeEditor content={jsonContent} setContent={mockSetContent} />, { wrapper: AllProviders });

        const select = screen.getByLabelText(/Language/i);
        expect(select).toHaveTextContent('Python');

        const textarea = screen.getByPlaceholderText('// Write your code here...');
        expect(textarea).toHaveValue('print("hello")');
    });

    it('returns raw string into code if not JSON', () => {
        const rawString = "const a = 1;";
        render(<CodeEditor content={rawString} setContent={mockSetContent} />, { wrapper: AllProviders });

        const textarea = screen.getByPlaceholderText('// Write your code here...');
        expect(textarea).toHaveValue('const a = 1;');

        const select = screen.getByLabelText(/Language/i);
        expect(select).toHaveTextContent('JavaScript'); // Default
    });

    it('calls setContent with JSON when code is changed', () => {
        render(<CodeEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });

        const textarea = screen.getByPlaceholderText('// Write your code here...');
        fireEvent.change(textarea, { target: { value: 'let x = 10;' } });

        expect(mockSetContent).toHaveBeenCalledWith(JSON.stringify({ language: 'javascript', code: 'let x = 10;' }));
    });

    it('inserts two spaces when Tab is pressed', async () => {
        render(<CodeEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });

        const textarea = screen.getByPlaceholderText('// Write your code here...');
        textarea.selectionStart = 0;
        textarea.selectionEnd = 0;

        fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' });

        expect(mockSetContent).toHaveBeenCalledWith(JSON.stringify({ language: 'javascript', code: '  ' }));
    });
});
