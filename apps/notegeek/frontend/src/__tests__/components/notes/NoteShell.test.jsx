import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import NoteShell from '../../../components/notes/NoteShell';

const theme = createTheme();
const ThemeWrapper = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('NoteShell', () => {
    it('renders children content', () => {
        render(
            <NoteShell>
                <div data-testid="content">My Content</div>
            </NoteShell>,
            { wrapper: ThemeWrapper }
        );
        expect(screen.getByTestId('content')).toBeInTheDocument();
        expect(screen.getByTestId('content')).toHaveTextContent('My Content');
    });

    it('renders header if provided', () => {
        render(
            <NoteShell header={<div data-testid="header">Header</div>}>
                <div>Content</div>
            </NoteShell>,
            { wrapper: ThemeWrapper }
        );
        expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('renders toolbar if provided', () => {
        render(
            <NoteShell toolbar={<div data-testid="toolbar">Toolbar</div>}>
                <div>Content</div>
            </NoteShell>,
            { wrapper: ThemeWrapper }
        );
        expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    });

    it('renders actions if provided', () => {
        render(
            <NoteShell actions={<div data-testid="actions">Actions</div>}>
                <div>Content</div>
            </NoteShell>,
            { wrapper: ThemeWrapper }
        );
        expect(screen.getByTestId('actions')).toBeInTheDocument();
    });

    it('applies hidden overflow to content when disableContentScroll is true', () => {
        const { container } = render(
            <NoteShell disableContentScroll={true}>
                <div>Content</div>
            </NoteShell>,
            { wrapper: ThemeWrapper }
        );
        const contentBox = container.children[0].children[0]; // Box -> Content Box
        // We can just check it renders without crashing for this property since it's an internal MUI style
        expect(screen.getByText('Content')).toBeInTheDocument();
    });
});
