import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../testUtils';
import NoteActions, { BackButton } from '../../../components/notes/NoteActions';

const theme = lightTheme;
const ThemeWrapper = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

/**
 * Since the Lab Notebook pass the editor has no Save button: it autosaves,
 * and the SaveStamp says where that stands. What NoteActions still owns is
 * the ⋯ menu (Save now, Version history, Compose, Delete) and, for mind
 * maps, the View/Edit toggle. These tests open the menu the way a person
 * does and query by ROLE: MUI copies a Tooltip's title onto a wrapper, so a
 * label query can match two elements.
 */
function openMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'More note actions' }));
    return screen.getByRole('menu');
}

describe('NoteActions', () => {
    let mockOnSave, mockOnDelete, mockOnToggleEdit;

    beforeEach(() => {
        mockOnSave = vi.fn();
        mockOnDelete = vi.fn();
        mockOnToggleEdit = vi.fn();
        vi.clearAllMocks();
    });

    it('has no Save button — only the ⋯ menu', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'More note actions' })).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('"Save now" in the menu saves', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        fireEvent.click(within(menu).getByRole('menuitem', { name: /save now/i }));
        expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it('offers no "Save now" in a mind map\'s view mode', () => {
        render(
            <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} isEditMode={false} canToggleEdit onToggleEdit={mockOnToggleEdit} />,
            { wrapper: ThemeWrapper },
        );
        const menu = openMenu();
        expect(within(menu).queryByRole('menuitem', { name: /save now/i })).not.toBeInTheDocument();
    });

    it('Delete is in the menu and calls back (the confirm dialog is the page\'s)', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        fireEvent.click(within(menu).getByRole('menuitem', { name: /delete note/i }));
        expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it('hides Delete when the note cannot be deleted', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} canDelete={false} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        expect(within(menu).queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('shows the View/Edit toggle for mind maps', () => {
        render(
            <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} canToggleEdit isEditMode onToggleEdit={mockOnToggleEdit} />,
            { wrapper: ThemeWrapper },
        );
        fireEvent.click(screen.getByRole('button', { name: /view/i }));
        expect(mockOnToggleEdit).toHaveBeenCalledTimes(1);
    });

    /**
     * History and Compose are offered by the PRESENCE of a handler, so a note
     * type that cannot be composed simply doesn't get the item.
     */
    describe('History and Compose', () => {
        it('offers neither without a handler', () => {
            render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
            const menu = openMenu();
            expect(within(menu).queryByRole('menuitem', { name: /version history/i })).not.toBeInTheDocument();
            expect(within(menu).queryByRole('menuitem', { name: 'Compose a document from this note' })).not.toBeInTheDocument();
        });

        it('offers History exactly once, and it calls back', () => {
            const onHistory = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onHistory={onHistory} />,
                { wrapper: ThemeWrapper },
            );
            const menu = openMenu();
            expect(within(menu).getAllByRole('menuitem', { name: /version history/i })).toHaveLength(1);
            fireEvent.click(within(menu).getByRole('menuitem', { name: /version history/i }));
            expect(onHistory).toHaveBeenCalledTimes(1);
        });

        it('offers Compose exactly once, and it calls back', () => {
            const onCompose = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onCompose={onCompose} />,
                { wrapper: ThemeWrapper },
            );
            const menu = openMenu();
            expect(within(menu).getAllByRole('menuitem', { name: 'Compose a document from this note' })).toHaveLength(1);
            fireEvent.click(within(menu).getByRole('menuitem', { name: 'Compose a document from this note' }));
            expect(onCompose).toHaveBeenCalledTimes(1);
        });

        it('locks Compose out while one is running', () => {
            const onCompose = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onCompose={onCompose} isComposing />,
                { wrapper: ThemeWrapper },
            );
            const menu = openMenu();
            expect(within(menu).getByRole('menuitem', { name: 'Compose a document from this note' }))
                .toHaveAttribute('aria-disabled', 'true');
        });
    });
});

describe('NoteActions — Pin/Unpin', () => {
    let mockOnSave, mockOnDelete;

    beforeEach(() => {
        mockOnSave = vi.fn();
        mockOnDelete = vi.fn();
        vi.clearAllMocks();
    });

    it('offers no Pin/Unpin without a handler (an unsaved note has nothing to pin)', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        expect(within(menu).queryByRole('menuitem', { name: /^pin$/i })).not.toBeInTheDocument();
        expect(within(menu).queryByRole('menuitem', { name: /^unpin$/i })).not.toBeInTheDocument();
    });

    it('labels the item "Pin" for an unpinned note, and calls onPin', () => {
        const onPin = vi.fn();
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onPin={onPin} pinned={false} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        const item = within(menu).getByRole('menuitem', { name: 'Pin' });
        expect(within(menu).queryByRole('menuitem', { name: 'Unpin' })).not.toBeInTheDocument();
        fireEvent.click(item);
        expect(onPin).toHaveBeenCalledTimes(1);
    });

    it('labels the item "Unpin" for a pinned note, and calls onPin', () => {
        const onPin = vi.fn();
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onPin={onPin} pinned />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        const item = within(menu).getByRole('menuitem', { name: 'Unpin' });
        expect(within(menu).queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument();
        fireEvent.click(item);
        expect(onPin).toHaveBeenCalledTimes(1);
    });

    it('flips the label when `pinned` flips, across a re-render', () => {
        const onPin = vi.fn();
        const { rerender } = render(
            <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onPin={onPin} pinned={false} />,
            { wrapper: ThemeWrapper },
        );
        const firstMenu = openMenu();
        expect(firstMenu).toHaveTextContent('Pin');
        fireEvent.keyDown(firstMenu, { key: 'Escape' });

        rerender(
            <ThemeWrapper>
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onPin={onPin} pinned />
            </ThemeWrapper>,
        );
        expect(openMenu()).toHaveTextContent('Unpin');
    });
});

describe('NoteActions — Print or save as PDF', () => {
    it('is in the menu when the page can print, and calls back', () => {
        const onPrint = vi.fn();
        render(<NoteActions onSave={vi.fn()} onDelete={vi.fn()} onPrint={onPrint} />, { wrapper: ThemeWrapper });
        const menu = openMenu();
        fireEvent.click(within(menu).getByRole('menuitem', { name: /print or save as pdf/i }));
        expect(onPrint).toHaveBeenCalledTimes(1);
    });

    it('is offered in a mind map\'s view mode too (printing is not editing)', () => {
        render(
            <NoteActions onPrint={vi.fn()} isEditMode={false} canToggleEdit onToggleEdit={vi.fn()} />,
            { wrapper: ThemeWrapper },
        );
        expect(within(openMenu()).getByRole('menuitem', { name: /print or save as pdf/i })).toBeInTheDocument();
    });

    it('is absent without a handler', () => {
        render(<NoteActions onSave={vi.fn()} onDelete={vi.fn()} />, { wrapper: ThemeWrapper });
        expect(within(openMenu()).queryByRole('menuitem', { name: /print/i })).not.toBeInTheDocument();
    });
});

describe('BackButton', () => {
    it('calls back', () => {
        const onBack = vi.fn();
        render(<BackButton onBack={onBack} />, { wrapper: ThemeWrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
