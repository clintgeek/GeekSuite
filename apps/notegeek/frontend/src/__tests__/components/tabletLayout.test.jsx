/**
 * NoteGeek on a tablet (tablet wave 2026-11-16): the shell at the harness
 * viewports — 390x844 phone, 800x1280 portrait tablet (Chef's grip),
 * 1280x800 landscape touch tablet, 1440x900 desktop.
 *
 *   - phone: the bottom bar (Home, Search, New, Notes), unchanged;
 *   - tablet: the rail instead — no bottom bar, no hamburger — with Tags,
 *     which opens the tag tree (and All notes / Archived / Recently deleted)
 *     so nothing the sidebar holds becomes unreachable;
 *   - desktop: the sidebar, as before;
 *   - two panes from 1024 px: list | note, and the list keeps its state
 *     while the note changes; one pane at 800.
 *
 * The viewport helper makes MUI's width queries and useFormFactor's pointer
 * queries answer for the same device.
 */
import React, { useEffect, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import ThemeModeProvider from '../../theme/ThemeModeProvider';
import Layout from '../../components/Layout';
import { VIEWPORTS, setViewport, restoreViewport } from '../helpers/viewport';

vi.mock('@geeksuite/user', () => ({
    ThemeProvider: ({ children }) => children,
    useThemeMode: () => ({ theme: 'light', themePreference: 'light', setThemePreference: vi.fn(), toggleTheme: vi.fn() }),
    usePreferences: vi.fn(() => ({ preferences: {}, loaded: true })),
}));

vi.mock('../../store/authStore', () => {
    const store = { user: { _id: 'u1', email: 'chef@example.com' }, isAuthenticated: true, logout: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    return { default: useStore };
});
vi.mock('../../store/noteStore', () => {
    const store = { clearNotes: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    return { default: useStore };
});
vi.mock('../../store/tagStore', () => {
    const store = { tags: [], fetchTags: vi.fn(), clearTags: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    return { default: useStore };
});
vi.mock('../../components/new/NoteImporter', () => ({ default: () => null }));

// The list: a stand-in with its own state (a filter) and a mount counter, so
// "the list keeps its filter while notes change" is observable.
vi.mock('../../components/NoteList', () => ({
    default: function NoteListStub() {
        const [filter, setFilter] = useState('All');
        useEffect(() => {
            globalThis.__noteListMounts = (globalThis.__noteListMounts || 0) + 1;
        }, []);
        return (
            <div data-testid="note-list">
                <button type="button" onClick={() => setFilter('Sketches')}>Filter sketches</button>
                <span data-testid="list-filter">{filter}</span>
                <Link to="/notes/a">Note A</Link>
                <Link to="/notes/b">Note B</Link>
            </div>
        );
    },
}));

function NoteStub() {
    const { id } = useParams();
    return <div data-testid="note-detail">note {id}</div>;
}

function renderAt(path) {
    return render(
        <ThemeModeProvider>
            <MockedProvider mocks={[]} addTypename={false}>
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route path="/" element={<Layout><div data-testid="home">home</div></Layout>} />
                        <Route path="/notes" element={<Layout><div data-testid="notes-route">notes</div></Layout>} />
                        <Route path="/notes/:id" element={<Layout><NoteStub /></Layout>} />
                        <Route path="/search" element={<Layout><div>search</div></Layout>} />
                    </Routes>
                </MemoryRouter>
            </MockedProvider>
        </ThemeModeProvider>
    );
}

const $ = (sel) => document.querySelector(sel);
const chrome = () => ({
    rail: Boolean($('nav[data-geek-nav-rail]')),
    bottom: Boolean($('[data-geek-bottom-nav]')),
    sidebar: Boolean($('[data-geek-nav]')),
    hamburger: Boolean($('[data-geek-topbar="menu"]')),
});
const railItems = () => [...document.querySelectorAll('[data-geek-nav-rail-item]')].map((el) => el.getAttribute('data-geek-nav-rail-item'));
const barItems = () => [...document.querySelectorAll('[data-geek-bottom-nav-item]')].map((el) => el.getAttribute('data-geek-bottom-nav-item'));

afterEach(() => {
    restoreViewport();
    globalThis.__noteListMounts = 0;
});

describe('NoteGeek navigation by device', () => {
    it('phone: the bottom bar, exactly as before — no rail, no Tags item', () => {
        setViewport(VIEWPORTS.phone);
        renderAt('/');
        expect(chrome()).toEqual({ rail: false, bottom: true, sidebar: false, hamburger: false });
        expect(barItems()).toEqual(['home', 'search', 'new', 'notes']);
    });

    it('phone: no bar on a single note (the note owns the screen)', () => {
        setViewport(VIEWPORTS.phone);
        renderAt('/notes/a');
        expect(chrome().bottom).toBe(false);
        expect(screen.getByTestId('note-detail')).toHaveTextContent('note a');
    });

    it.each([
        ['portrait 800x1280', VIEWPORTS.tabletPortrait],
        ['landscape 1280x800 (touch)', VIEWPORTS.tabletLandscape],
    ])('tablet %s: the rail — no bottom bar, no hamburger, no sidebar', (_n, vp) => {
        setViewport(vp);
        renderAt('/');
        expect(chrome()).toEqual({ rail: true, bottom: false, sidebar: false, hamburger: false });
        expect(railItems()).toEqual(['home', 'search', 'new', 'notes', 'tags']);
        expect($('[data-geek-nav-rail-item="home"]').getAttribute('aria-current')).toBe('page');
    });

    it('tablet: the rail stays on a single note, so the writer can jump without Back', () => {
        setViewport(VIEWPORTS.tabletPortrait);
        renderAt('/notes/a');
        expect(chrome().rail).toBe(true);
        expect($('[data-geek-nav-rail-item="notes"]').getAttribute('aria-current')).toBe('page');
    });

    it('tablet: Tags opens the tag tree with All notes, Archived and Recently deleted', async () => {
        setViewport(VIEWPORTS.tabletPortrait);
        renderAt('/notes');
        fireEvent.click($('[data-geek-nav-rail-item="tags"]'));
        const sheet = await screen.findByRole('dialog', { name: 'Tags' });
        expect(within(sheet).getByRole('link', { name: /all notes/i })).toHaveAttribute('href', '/notes');
        expect(within(sheet).getByRole('link', { name: /archived/i })).toHaveAttribute('href', '/archived');
        expect(within(sheet).getByRole('link', { name: /recently deleted/i })).toHaveAttribute('href', '/deleted');
        expect(within(sheet).getByRole('textbox', { name: /filter tags/i })).toBeInTheDocument();
    });

    it('tablet: New opens the New sheet (note, photo, sketch, more)', async () => {
        setViewport(VIEWPORTS.tabletPortrait);
        renderAt('/');
        fireEvent.click($('[data-geek-nav-rail-item="new"]'));
        expect(await screen.findByRole('dialog', { name: 'New' })).toBeInTheDocument();
    });

    it('tablet: the top bar has no search box and no New split button (the rail has both)', () => {
        setViewport(VIEWPORTS.tabletLandscape);
        renderAt('/');
        expect(screen.queryByRole('textbox', { name: /search notes/i })).toBeNull();
        expect(screen.queryByRole('button', { name: 'More kinds of note' })).toBeNull();
    });

    it('desktop: the sidebar, the top-bar search and New — no rail', () => {
        setViewport(VIEWPORTS.desktop);
        renderAt('/');
        expect(chrome()).toEqual({ rail: false, bottom: false, sidebar: true, hamburger: false });
        expect(screen.getByRole('textbox', { name: /search notes/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'More kinds of note' })).toBeInTheDocument();
    });
});

describe('two panes from 1024 px', () => {
    it('portrait 800: one pane — a note is the whole page, as before', () => {
        setViewport(VIEWPORTS.tabletPortrait);
        renderAt('/notes/a');
        expect($('[data-note-two-pane]')).toBeNull();
        expect(screen.queryByTestId('note-list')).toBeNull();
        expect(screen.getByTestId('note-detail')).toBeInTheDocument();
    });

    it('landscape 1280: the list beside the note', () => {
        setViewport(VIEWPORTS.tabletLandscape);
        renderAt('/notes/a');
        const list = screen.getByRole('region', { name: 'Notes' });
        const note = screen.getByRole('region', { name: 'Note' });
        expect(within(list).getByTestId('note-list')).toBeInTheDocument();
        expect(within(note).getByTestId('note-detail')).toHaveTextContent('note a');
    });

    it('landscape 1280, /notes: the list and a "Pick a note" placeholder', () => {
        setViewport(VIEWPORTS.tabletLandscape);
        renderAt('/notes');
        expect(screen.getByTestId('note-list')).toBeInTheDocument();
        expect(screen.getByText('Pick a note')).toBeInTheDocument();
    });

    it('the list keeps its state (one mount, its filter) while notes change', async () => {
        setViewport(VIEWPORTS.tabletLandscape);
        renderAt('/notes');
        fireEvent.click(screen.getByRole('button', { name: 'Filter sketches' }));
        await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Note A' })));
        expect(screen.getByTestId('note-detail')).toHaveTextContent('note a');
        await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Note B' })));
        expect(screen.getByTestId('note-detail')).toHaveTextContent('note b');
        expect(screen.getByTestId('list-filter')).toHaveTextContent('Sketches');
        expect(globalThis.__noteListMounts).toBe(1);
    });

    it('desktop 1440: one pane, as before — two panes are held back to the tablet', () => {
        setViewport(VIEWPORTS.desktop);
        renderAt('/notes/b');
        expect($('[data-note-two-pane]')).toBeNull();
        expect(screen.queryByTestId('note-list')).toBeNull();
        expect(screen.getByTestId('note-detail')).toHaveTextContent('note b');
    });
});
