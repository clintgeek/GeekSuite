# NoteGeek Editor System Rewrite Plan

## ✅ IMPLEMENTATION COMPLETE (Dec 18, 2025)

The editor system has been rewritten with a lightweight, modular architecture optimized for low-memory devices (Fire tablet 3GB RAM target).

### What Was Built
- **New foundation components**: `NoteShell`, `NoteMetaBar`, `NoteActions`, `NoteTypeRouter`
- **Upgraded editors** (no new dependencies added):
  - **Markdown**: Edit/Split/Preview modes using existing `react-markdown`
  - **Code**: Line numbers, tab handling, JSON storage for language persistence
  - **Handwritten**: Color picker (6 colors), pen size slider
  - **Mind Map**: Inline editing (double-click), removed `window.prompt()`
- **New page**: `NoteEditorPage.jsx` replaces monolithic `NoteEditor.jsx`
- **Lazy loading**: All editors loaded via `React.lazy()` for smaller initial bundle

### Files Created
- `client/src/components/notes/NoteShell.jsx`
- `client/src/components/notes/NoteMetaBar.jsx`
- `client/src/components/notes/NoteActions.jsx`
- `client/src/components/notes/NoteTypeRouter.jsx`
- `client/src/components/notes/index.js`
- `client/src/pages/NoteEditorPage.jsx`

### Files Modified
- `client/src/components/editors/MarkdownEditor.jsx` - Added preview modes
- `client/src/components/editors/CodeEditor.jsx` - Line numbers, JSON storage
- `client/src/components/editors/HandwrittenEditor.jsx` - Colors, pen sizes
- `client/src/components/editors/MindMapEditor.jsx` - Inline editing callbacks
- `client/src/components/MindMapNode.jsx` - Inline text editing
- `client/src/App.jsx` - Updated routes
- `client/src/pages/NotePage.jsx` - Uses new editor
- `client/src/pages/QuickCaptureHome.jsx` - Updated imports
- `client/src/components/NoteTypeSelector.jsx` - Updated imports

### Old File (Can Be Deleted Later)
- `client/src/components/NoteEditor.jsx` - 527 lines, no longer used

---

## Original Analysis (For Reference)

## Executive Summary

The current note editor system attempts to use a single monolithic component (`NoteEditor.jsx`) to handle all note types through conditional rendering. This "code golf" approach has led to:
- Complex state management with many edge cases
- Difficult-to-maintain code with interleaved concerns
- Inconsistent UX across note types
- Limited extensibility for new features

**Proposed Solution**: A modular architecture with dedicated editor/viewer components per note type, unified through a common interface and shared infrastructure.

---

## Current Architecture Analysis

### What We Have

| Component | Library | Issues |
|-----------|---------|--------|
| **RichTextEditor** | TipTap (StarterKit) | Good foundation, but limited features (no tables, images, task lists) |
| **MarkdownEditor** | Plain `<TextField>` | No preview, no syntax highlighting, no toolbar |
| **CodeEditor** | Plain `<TextField>` | No syntax highlighting, language selector not persisted |
| **MindMapEditor** | ReactFlow | Functional but complex, prompt-based editing is clunky |
| **HandwrittenEditor** | react-signature-canvas | Works but limited (no colors, pen sizes, eraser) |

### Storage Model (MongoDB)
```javascript
{
  title: String,
  content: String,        // All types stored as string (HTML, JSON, base64, etc.)
  type: 'text' | 'markdown' | 'code' | 'mindmap' | 'handwritten',
  tags: [String],
  userId: ObjectId,
  isLocked: Boolean,
  isEncrypted: Boolean,
  timestamps: true
}
```

### Pain Points
1. **NoteEditor.jsx is 527 lines** handling creation, editing, viewing, type switching, save logic, and mobile layouts
2. **No separation between edit and view modes** for most types
3. **Content format varies wildly** by type (HTML, raw text, JSON, base64 PNG)
4. **NoteViewer.jsx exists but is barely used** — most viewing happens in editor
5. **Mobile UX is bolted on** with fixed positioning hacks

---

## Proposed Architecture

### Design Principles
1. **One editor per note type** — each type gets its own dedicated component
2. **Unified interface** — all editors implement the same props contract
3. **Separate view and edit modes** — clean read-only rendering
4. **Content normalization** — consistent storage format per type
5. **Mobile-first** — responsive by design, not by afterthought

### Component Structure

```
src/
├── components/
│   ├── notes/
│   │   ├── NoteShell.jsx           # Layout wrapper (header, actions, tags)
│   │   ├── NoteTypeRouter.jsx      # Routes to correct editor/viewer
│   │   ├── NoteActions.jsx         # Save, delete, share actions
│   │   └── NoteMetaBar.jsx         # Title, tags, type badge
│   │
│   ├── editors/
│   │   ├── EditorInterface.ts      # TypeScript interface (optional)
│   │   ├── RichTextEditor/
│   │   │   ├── index.jsx
│   │   │   ├── Toolbar.jsx
│   │   │   └── extensions/         # TipTap extensions
│   │   ├── MarkdownEditor/
│   │   │   ├── index.jsx
│   │   │   ├── Toolbar.jsx
│   │   │   └── Preview.jsx
│   │   ├── CodeEditor/
│   │   │   ├── index.jsx
│   │   │   └── LanguageSelector.jsx
│   │   ├── MindMapEditor/
│   │   │   ├── index.jsx
│   │   │   ├── NodeEditor.jsx      # Inline editing, not prompts
│   │   │   └── Toolbar.jsx
│   │   └── HandwrittenEditor/
│   │       ├── index.jsx
│   │       └── Toolbar.jsx         # Pen, eraser, colors
│   │
│   └── viewers/
│       ├── RichTextViewer.jsx
│       ├── MarkdownViewer.jsx
│       ├── CodeViewer.jsx
│       ├── MindMapViewer.jsx
│       └── HandwrittenViewer.jsx
```

### Unified Editor Interface

Every editor component will implement:

```typescript
interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}
```

This allows `NoteTypeRouter` to be a simple switch:

```jsx
function NoteTypeRouter({ type, content, onChange, readOnly }) {
  const Editor = EDITORS[type] || RichTextEditor;
  return <Editor content={content} onChange={onChange} readOnly={readOnly} />;
}
```

---

## Library Recommendations

### Rich Text: **TipTap** (keep, enhance)
- Already installed and working
- Add extensions: `@tiptap/extension-table`, `@tiptap/extension-image`, `@tiptap/extension-task-list`, `@tiptap/extension-highlight`
- Consider `@tiptap/extension-collaboration` for future real-time editing

### Markdown: **@uiw/react-md-editor** or **Milkdown**
| Option | Pros | Cons |
|--------|------|------|
| **@uiw/react-md-editor** | Simple, split-pane preview, toolbar included | Less customizable |
| **Milkdown** | Plugin-based, TipTap-like architecture, beautiful | Steeper learning curve |
| **Keep TextField + add preview** | No new deps | Poor DX, no syntax highlighting |

**Recommendation**: `@uiw/react-md-editor` — simple, battle-tested, good mobile support.

### Code: **Monaco Editor** or **CodeMirror 6**
| Option | Pros | Cons |
|--------|------|------|
| **Monaco** | VS Code engine, excellent intellisense | Heavy (~2MB), complex setup |
| **CodeMirror 6** | Lightweight, mobile-friendly, extensible | Less "IDE-like" |
| **react-simple-code-editor** | Tiny, simple | Limited features |

**Recommendation**: `@uiw/react-codemirror` — good balance of features and bundle size, excellent mobile support.

### Mind Map: **ReactFlow** (keep, enhance)
- Already working well
- Replace `window.prompt()` with inline editing (double-click to edit)
- Add keyboard shortcuts (Enter = add sibling, Tab = add child)
- Consider adding node styling options

### Handwritten: **tldraw** or **Excalidraw** (replace)
| Option | Pros | Cons |
|--------|------|------|
| **tldraw** | Modern, infinite canvas, shapes + freehand, excellent mobile | Larger bundle |
| **Excalidraw** | Popular, collaborative, hand-drawn style | Heavier, more opinionated |
| **Keep react-signature-canvas** | Already works | Very limited features |

**Recommendation**: `@tldraw/tldraw` — transforms handwritten notes into a full sketching tool with shapes, text, and infinite canvas. Much better mobile experience.

---

## Storage Format Recommendations

### Current vs Proposed

| Type | Current Format | Proposed Format | Migration |
|------|---------------|-----------------|-----------|
| Rich Text | HTML string | HTML string | None needed |
| Markdown | Raw markdown | Raw markdown | None needed |
| Code | Raw code (language in content) | `{ language: string, code: string }` | Parse existing |
| Mind Map | JSON `{ nodes, edges }` | JSON `{ nodes, edges }` | None needed |
| Handwritten | Base64 PNG | tldraw JSON or keep base64 | Migration script |

### Code Note Enhancement
Store language metadata properly:
```javascript
// Before
content: "```javascript\nconsole.log('hello');\n```"

// After
content: JSON.stringify({
  language: 'javascript',
  code: "console.log('hello');"
})
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. Create `NoteShell.jsx` — unified layout wrapper
2. Create `NoteTypeRouter.jsx` — type-based component routing
3. Create `NoteActions.jsx` — extracted save/delete logic
4. Create `NoteMetaBar.jsx` — title, tags, type display
5. Refactor existing editors to use unified interface
6. **No new libraries yet** — just restructure

### Phase 2: Markdown & Code Upgrade (Week 2)
1. Install `@uiw/react-md-editor`
2. Build new `MarkdownEditor` with live preview
3. Install `@uiw/react-codemirror`
4. Build new `CodeEditor` with syntax highlighting
5. Update storage format for code notes
6. Write migration for existing code notes

### Phase 3: Rich Text Enhancement (Week 3)
1. Add TipTap extensions (tables, images, task lists)
2. Build proper toolbar with all formatting options
3. Add image upload/paste support
4. Improve mobile toolbar (collapsible, swipeable)

### Phase 4: Mind Map Polish (Week 4)
1. Replace `window.prompt()` with inline node editing
2. Add keyboard shortcuts
3. Add node styling (colors, shapes)
4. Improve mobile touch interactions
5. Add export options (PNG, SVG)

### Phase 5: Handwritten Upgrade (Week 5)
1. Install `@tldraw/tldraw`
2. Build new `HandwrittenEditor` wrapper
3. Write migration for existing base64 content
4. Add shape tools, colors, text
5. Optimize for stylus input

### Phase 6: Cleanup & Polish (Week 6)
1. Delete old `NoteEditor.jsx` (527 lines → 0)
2. Delete old `NoteViewer.jsx`
3. Update all routes and navigation
4. Performance optimization (lazy loading editors)
5. Comprehensive testing

---

## Mobile-First Considerations

### Layout Strategy
```
┌─────────────────────────────┐
│  NoteMetaBar (title, type)  │  ← Sticky header
├─────────────────────────────┤
│                             │
│      Editor Content         │  ← Scrollable
│                             │
├─────────────────────────────┤
│  Toolbar (formatting)       │  ← Sticky bottom (above nav)
├─────────────────────────────┤
│  NoteActions (save/delete)  │  ← FAB or bottom bar
└─────────────────────────────┘
```

### Touch Optimizations
- **Larger tap targets** (44px minimum)
- **Swipe gestures** for toolbar sections
- **Long-press menus** instead of right-click
- **Keyboard-aware layouts** that adjust when virtual keyboard appears

---

## Dependency Changes

### Add
```json
{
  "@uiw/react-md-editor": "^4.0.0",
  "@uiw/react-codemirror": "^4.21.0",
  "@codemirror/lang-javascript": "^6.0.0",
  "@codemirror/lang-python": "^6.0.0",
  "@tiptap/extension-table": "^2.0.0",
  "@tiptap/extension-image": "^2.0.0",
  "@tiptap/extension-task-list": "^2.0.0",
  "@tldraw/tldraw": "^2.0.0"
}
```

### Remove (after migration)
```json
{
  "react-signature-canvas": "^1.1.0-alpha.2"  // Replaced by tldraw
}
```

### Keep
```json
{
  "@tiptap/*": "^2.11.7",      // Rich text
  "reactflow": "^11.11.4",     // Mind maps
  "react-markdown": "^10.1.0"  // Markdown viewing (backup)
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| tldraw bundle size | Medium | Medium | Lazy load, code split |
| Migration breaks existing notes | Low | High | Backup before migration, test thoroughly |
| Mobile performance | Medium | Medium | Profile early, optimize render cycles |
| Learning curve for new libs | Low | Low | Good documentation, similar patterns |

---

## Success Metrics

1. **Code reduction**: `NoteEditor.jsx` from 527 lines to 0 (logic distributed)
2. **Bundle size**: < 500KB increase despite new features
3. **Mobile Lighthouse score**: > 90 performance
4. **Feature parity**: All existing functionality preserved
5. **New capabilities**: Syntax highlighting, live preview, shapes, better touch

---

## Decision Points for Chef

1. **Markdown editor**: `@uiw/react-md-editor` vs Milkdown vs keep simple?
2. **Code editor**: CodeMirror vs Monaco vs keep simple?
3. **Handwritten**: tldraw vs Excalidraw vs keep signature canvas?
4. **Timeline**: Full 6-week plan or prioritize specific phases?
5. **Migration**: Auto-migrate on first load vs batch migration script?

---

## Next Steps

Once you approve the direction:
1. I'll create the foundation components (Phase 1)
2. We can iterate on library choices with small POCs
3. Implement phase by phase with working code at each step

Let me know which aspects you'd like to discuss or modify!
