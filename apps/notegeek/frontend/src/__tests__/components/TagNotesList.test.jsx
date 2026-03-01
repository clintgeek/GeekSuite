import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import TagNotesList from '../../components/TagNotesList';

const theme = createTheme();

vi.mock('../../components/NoteList', () => ({
    default: ({ tag }) => <div data-testid="notelist-mock">NoteList for tag: {tag}</div>
}));

const TagNotesListTestWrapper = ({ children, initialPath }) => (
    <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/tags/:tag" element={children} />
                <Route path="/missing" element={children} />
            </Routes>
        </MemoryRouter>
    </ThemeProvider>
);

describe('TagNotesList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows error alert if no tag is found in URL', () => {
        render(<TagNotesList />, {
            wrapper: ({ children }) => <TagNotesListTestWrapper initialPath="/missing">{children}</TagNotesListTestWrapper>
        });

        expect(screen.getByText('No tag parameter found in URL')).toBeInTheDocument();
        expect(screen.queryByTestId('notelist-mock')).not.toBeInTheDocument();
    });

    it('decodes tag and renders breadcrumbs correctly', () => {
        render(<TagNotesList />, {
            wrapper: ({ children }) => <TagNotesListTestWrapper initialPath="/tags/project%2Ffoo%2Fbar">{children}</TagNotesListTestWrapper>
        });

        // Breadcrumbs should have Home, project, foo, bar
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('project')).toBeInTheDocument();
        expect(screen.getByText('foo')).toBeInTheDocument();

        // The last breadcrumb item is a Typography, not a link usually, but it will be there
        expect(screen.getByText('bar')).toBeInTheDocument();

        // Tests NoteList renders with decoded tag
        expect(screen.getByTestId('notelist-mock')).toHaveTextContent('NoteList for tag: project/foo/bar');
    });
});
