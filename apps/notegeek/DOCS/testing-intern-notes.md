# NoteGeek Frontend Testing Guide (Intern Notes)

Welcome to the NoteGeek frontend! We're currently working on improving our test coverage using **Vitest** and **React Testing Library**. You've joined at a great time—we just got the baseline data stores, API services, and basic UI components fully tested and passing.

This document outlines exactly what needs to be tested next and gives you some tips on how to approach these components.

## Current Testing Stack

- **Runner**: Vitest (`npm run test` or `npm run test:watch`)
- **UI Testing**: React Testing Library (`@testing-library/react`)
- **State Mocking**: For components that use global Zustand stores (like `useNoteStore` or `useAuthStore`), we mock the store module using `vi.mock()`. Check out `src/__tests__/components/NoteList.test.jsx` for a solid example of how to mock a Zustand store in our setup.

---

## 🚀 Priority 1: Note View & Editors (`src/components/notes/` & `src/components/editors/`)

These are the most critical, complex parts of the application and have the lowest test coverage right now.

### 1. Editor Components (`src/components/editors/`)
NoteGeek supports multiple note types, each with its own editor component. 
* **What to test:** Loading states, saving mechanisms (debounced typing), and basic rendering.
* **The Files:**
  - `MarkdownEditor.jsx`
  - `RichTextEditor.jsx`
  - `CodeEditor.jsx`
  - `HandwrittenEditor.jsx`
  - `MindMapEditor.jsx`
  - `EditorErrorBoundary.jsx` (Test that it catches errors and displays the fallback UI smoothly)

*(Tip: Start with `MarkdownEditor` as it's the most standard, and use that test as a template for the others!)*

### 2. Note Shell & Wrappers (`src/components/notes/`)
These wrap around the specific editor types and handle the note metadata (tags, colors, actions).
* **What to test:** Ensure the correct editor is loaded via `NoteTypeRouter`, check that the title/tags render correctly in `NoteMetaBar`, and verify the "Delete/Export" buttons work in `NoteActions`.
* **The Files:**
  - `NoteShell.jsx`
  - `NoteActions.jsx`
  - `NoteMetaBar.jsx`
  - `NoteTypeRouter.jsx`

---

## 🛳️ Priority 2: Navigation & Organization (`src/components/`)

These components govern how users find and organize their notes.

* **What to test:** Clicking tags updates the filter state, the sidebar correctly collapses on mobile, and context menus open.
* **The Files:**
  - `Sidebar.jsx`
  - `TagNotesList.jsx`
  - `TagContextMenu.jsx`
  - `MobileBottomNav.jsx`

---

## 🛠️ General Tips & Gotchas

1. **MUI and Emotion Errors:** We use Material UI (MUI). If a component throws an error in testing about `useThemeMode must be used within ThemeModeProvider`, you need to wrap your component render in our custom providers! We usually do this with a wrapper function:

```jsx
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../theme/ThemeModeProvider';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// usage: render(<MyComponent />, { wrapper: AllProviders });
```

2. **Zustand Mocks:** Our stores use a combination of generic state and specific functions (like `fetchNotes`). A robust mock looks like this:

```jsx
vi.mock('../../store/noteStore', () => {
    const store = {
        notes: [],
        isLoadingList: false,
        fetchNotes: vi.fn(),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});
```

3. **Window/MatchMedia Errors:** Some components (like Mantine or charts) require `window.matchMedia` or `ResizeObserver`, which don't exist in our JSDOM test environment. If you see errors about these, you can easily mock them globally at the top of your test file. See `NoteList.test.jsx` for the mock code blocks.

Good luck! You've got this. If you get stuck, look at the existing test files in the `src/__tests__/` directory.
