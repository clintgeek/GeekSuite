# NoteGeek UI Redesign Plan

## 🎯 Overview

A comprehensive UI overhaul to transform NoteGeek into a modern, joyful, and highly usable note-taking application across phone, tablet, and desktop. The redesign prioritizes simplicity, touch-friendliness, and visual delight while preserving all existing functionality.

---

## 📋 Current State Analysis

### Existing Features (Must Preserve)
- **Rich Text Editor** (TipTap) - WYSIWYG editing with formatting toolbar
- **Markdown Editor** - Raw markdown input
- **Code Editor** - Syntax-highlighted code notes
- **Mind Map Editor** (ReactFlow) - Visual node-based mind mapping
- **Handwritten Notes** (react-signature-canvas) - Touch/stylus drawing
- **Tag System** - Hierarchical tags with snake_case formatting
- **Search** - Full-text note search
- **SSO Authentication** - GeekSuite integration

### Current Tech Stack
- **UI Framework**: MUI (Material-UI) v7 + Mantine v7 (mixed - needs consolidation)
- **Icons**: MUI Icons + Tabler Icons (mixed)
- **Styling**: Emotion + SASS
- **State**: Zustand
- **Routing**: React Router v6

### Current Pain Points
1. Mixed UI libraries (MUI + Mantine) causing inconsistency
2. Desktop-first design not optimized for mobile
3. Dated color palette (generic blues)
4. Sidebar navigation feels cramped on mobile
5. Note type selection buried in editor header
6. No dark mode support
7. Header branding lacks visual distinction between "Note" and "Geek"

---

## 🎨 Design System

### Color Palette

#### Dark Mode (Primary)
```scss
// Primary Colors
$primary-dark: #3B82F6;        // Vibrant blue - "Note" color
$primary-light: #60A5FA;       // Lighter blue for hover states

// Secondary Colors
$secondary-dark: #8B5CF6;      // Purple - "Geek" color
$secondary-light: #A78BFA;     // Lighter purple for hover

// Background Colors
$bg-dark-primary: #0F172A;     // Deep navy - main background
$bg-dark-secondary: #1E293B;   // Slate - cards/surfaces
$bg-dark-tertiary: #334155;    // Lighter slate - elevated surfaces

// Text Colors
$text-dark-primary: #F8FAFC;   // Near white
$text-dark-secondary: #94A3B8; // Muted slate
$text-dark-tertiary: #64748B;  // Dimmed slate

// Accent Colors
$accent-success: #10B981;      // Emerald green
$accent-warning: #F59E0B;      // Amber
$accent-error: #EF4444;        // Red
$accent-info: #06B6D4;         // Cyan

// Border Colors
$border-dark: #334155;         // Subtle borders
$border-dark-hover: #475569;   // Hover state borders
```

#### Light Mode
```scss
// Primary Colors
$primary-light-mode: #2563EB; // Deeper blue - "Note" color
$primary-light-hover: #3B82F6;

// Secondary Colors
$secondary-light-mode: #7C3AED; // Deeper purple - "Geek" color
$secondary-light-hover: #8B5CF6;

// Background Colors
$bg-light-primary: #F8FAFC;    // Off-white - main background
$bg-light-secondary: #FFFFFF;  // Pure white - cards
$bg-light-tertiary: #F1F5F9;   // Light gray - elevated

// Text Colors
$text-light-primary: #0F172A;  // Near black
$text-light-secondary: #475569; // Muted
$text-light-tertiary: #94A3B8;  // Dimmed

// Border Colors
$border-light: #E2E8F0;
$border-light-hover: #CBD5E1;
```

### Typography

```scss
// Font Stack
$font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
$font-family-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;

// Font Sizes (Mobile-first)
$font-size-xs: 0.75rem;    // 12px
$font-size-sm: 0.875rem;   // 14px
$font-size-base: 1rem;     // 16px
$font-size-lg: 1.125rem;   // 18px
$font-size-xl: 1.25rem;    // 20px
$font-size-2xl: 1.5rem;    // 24px
$font-size-3xl: 1.875rem;  // 30px

// Font Weights
$font-weight-normal: 400;
$font-weight-medium: 500;
$font-weight-semibold: 600;
$font-weight-bold: 700;

// Line Heights
$line-height-tight: 1.25;
$line-height-normal: 1.5;
$line-height-relaxed: 1.75;
```

### Spacing System

```scss
// Base unit: 4px
$space-0: 0;
$space-1: 0.25rem;   // 4px
$space-2: 0.5rem;    // 8px
$space-3: 0.75rem;   // 12px
$space-4: 1rem;      // 16px
$space-5: 1.25rem;   // 20px
$space-6: 1.5rem;    // 24px
$space-8: 2rem;      // 32px
$space-10: 2.5rem;   // 40px
$space-12: 3rem;     // 48px
$space-16: 4rem;     // 64px
```

### Border Radius

```scss
$radius-sm: 0.375rem;  // 6px - buttons, inputs
$radius-md: 0.5rem;    // 8px - cards
$radius-lg: 0.75rem;   // 12px - modals, large cards
$radius-xl: 1rem;      // 16px - feature cards
$radius-full: 9999px;  // Pills, avatars
```

### Shadows

```scss
// Dark mode shadows (subtle, using opacity)
$shadow-sm-dark: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
$shadow-md-dark: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
$shadow-lg-dark: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);

// Light mode shadows
$shadow-sm-light: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
$shadow-md-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
$shadow-lg-light: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
```

---

## 🏗️ Architecture Changes

### Library Consolidation

**Decision: Standardize on MUI v7**

Remove Mantine and consolidate on MUI for consistency:

```json
// Dependencies to REMOVE
"@mantine/core": "^7.17.3",
"@mantine/hooks": "^7.17.3",
"postcss-preset-mantine": "^1.17.0",

// Dependencies to KEEP/UPDATE
"@mui/material": "^7.0.1",
"@mui/icons-material": "^7.0.1",
"@emotion/react": "^11.14.0",
"@emotion/styled": "^11.14.0",

// Dependencies to ADD
"@fontsource/inter": "^5.0.0",
"@fontsource/jetbrains-mono": "^5.0.0"
```

**Icon Consolidation: Use Lucide React**

Replace both MUI Icons and Tabler Icons with Lucide for a more modern, consistent icon set:

```json
// REMOVE
"@mui/icons-material": "^7.0.1",
"@tabler/icons-react": "^3.31.0",

// ADD
"lucide-react": "^0.400.0"
```

---

## 📱 Layout Redesign

### Mobile-First Responsive Breakpoints

```scss
$breakpoint-sm: 640px;   // Small phones
$breakpoint-md: 768px;   // Tablets
$breakpoint-lg: 1024px;  // Small laptops
$breakpoint-xl: 1280px;  // Desktops
$breakpoint-2xl: 1536px; // Large screens
```

### New Layout Structure

#### Mobile Layout (< 768px)
```
┌─────────────────────────────┐
│  Header (sticky, 56px)      │
│  [≡] Note[Geek] [🔍] [+]    │
├─────────────────────────────┤
│                             │
│     Main Content Area       │
│     (full width, padded)    │
│                             │
│                             │
├─────────────────────────────┤
│  Bottom Nav (fixed, 64px)   │
│  [📝] [🏷️] [⚙️]             │
└─────────────────────────────┘
```

#### Tablet Layout (768px - 1024px)
```
┌─────────────────────────────────────────┐
│  Header (sticky, 64px)                  │
│  [≡] Note[Geek]        [🔍 Search...]   │
├──────────┬──────────────────────────────┤
│ Sidebar  │                              │
│ (240px)  │     Main Content Area        │
│ Collaps- │     (flexible width)         │
│ ible     │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

#### Desktop Layout (> 1024px)
```
┌──────────────────────────────────────────────────────┐
│  Header (sticky, 64px)                               │
│  Note[Geek]              [🔍 Search notes...]  [👤]  │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │                                           │
│ (260px)  │          Main Content Area                │
│ Always   │          (max-width: 900px, centered)     │
│ Visible  │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

---

## 🧩 Component Redesigns

### 1. Header Component

**Current Issues:**
- "NoteGeek" is monochrome
- `</>` suffix feels dated
- No visual hierarchy

**New Design:**

```jsx
// Header.jsx - New Implementation
<AppBar position="sticky" elevation={0}>
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    {/* Mobile menu button */}
    <IconButton sx={{ display: { md: 'none' } }}>
      <Menu />
    </IconButton>

    {/* Logo */}
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          color: 'primary.main',  // Blue
          letterSpacing: '-0.02em'
        }}
      >
        Note
      </Typography>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          color: 'secondary.main',  // Purple
          letterSpacing: '-0.02em'
        }}
      >
        Geek
      </Typography>
    </Box>

    {/* Search (tablet+) */}
    <SearchInput sx={{ display: { xs: 'none', md: 'flex' } }} />

    {/* Actions */}
    <Box sx={{ display: 'flex', gap: 1 }}>
      <IconButton sx={{ display: { md: 'none' } }}>
        <Search />
      </IconButton>
      <IconButton onClick={createNewNote}>
        <Plus />
      </IconButton>
      <ThemeToggle />
    </Box>
  </Toolbar>
</AppBar>
```

**Styling:**
```scss
.header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(8px);

  .logo {
    .note { color: var(--primary); }
    .geek { color: var(--secondary); }
  }
}
```

### 2. Sidebar Component

**Current Issues:**
- Fixed width doesn't adapt well
- Tag list can get very long
- No visual grouping

**New Design:**

```jsx
// Sidebar.jsx - New Structure
<Drawer variant="persistent" open={open}>
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

    {/* Quick Actions */}
    <Box sx={{ p: 2 }}>
      <Button
        fullWidth
        variant="contained"
        startIcon={<Plus />}
        sx={{ mb: 2 }}
      >
        New Note
      </Button>
    </Box>

    {/* Navigation */}
    <List>
      <NavItem icon={<FileText />} label="All Notes" to="/" />
      <NavItem icon={<Search />} label="Search" to="/search" />
    </List>

    <Divider sx={{ my: 1 }} />

    {/* Tags Section */}
    <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline" color="text.secondary">
          Tags
        </Typography>
        <IconButton size="small">
          <ChevronDown />
        </IconButton>
      </Box>

      {/* Tag Filter */}
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          size="small"
          placeholder="Filter tags..."
          fullWidth
          InputProps={{
            startAdornment: <Search size={16} />
          }}
        />
      </Box>

      {/* Scrollable Tag List */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        <TagTree tags={tags} />
      </Box>
    </Box>

    <Divider />

    {/* Footer Actions */}
    <Box sx={{ p: 2 }}>
      <NavItem icon={<Settings />} label="Settings" to="/settings" />
      <NavItem icon={<LogOut />} label="Logout" onClick={logout} />
    </Box>
  </Box>
</Drawer>
```

### 3. Note List Component

**Current Issues:**
- Single column wastes space on desktop
- Cards lack visual hierarchy
- No quick actions

**New Design - Card Grid:**

```jsx
// NoteList.jsx - Card-based grid layout
<Box sx={{
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'repeat(2, 1fr)',
    lg: 'repeat(3, 1fr)'
  },
  gap: 2,
  p: 2
}}>
  {notes.map(note => (
    <NoteCard key={note._id} note={note} />
  ))}
</Box>

// NoteCard.jsx
<Card
  sx={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.2s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: 'lg'
    }
  }}
>
  <CardActionArea component={Link} to={`/notes/${note._id}`}>
    {/* Note Type Indicator */}
    <Box sx={{
      p: 1.5,
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      borderBottom: '1px solid',
      borderColor: 'divider'
    }}>
      <NoteTypeIcon type={note.type} />
      <Typography variant="caption" color="text.secondary">
        {note.type}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Typography variant="caption" color="text.tertiary">
        {formatDate(note.updatedAt)}
      </Typography>
    </Box>

    <CardContent sx={{ flex: 1 }}>
      <Typography variant="h6" gutterBottom noWrap>
        {note.title || 'Untitled'}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {getPreview(note.content)}
      </Typography>
    </CardContent>

    {/* Tags */}
    {note.tags.length > 0 && (
      <Box sx={{ px: 2, pb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {note.tags.slice(0, 3).map(tag => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
        ))}
        {note.tags.length > 3 && (
          <Chip
            label={`+${note.tags.length - 3}`}
            size="small"
            sx={{ fontSize: '0.7rem' }}
          />
        )}
      </Box>
    )}
  </CardActionArea>
</Card>
```

### 4. Note Editor Component

**Current Issues:**
- Type selector only shows for new notes
- Header is cluttered on mobile
- Save/delete buttons not thumb-friendly

**New Design - Floating Action Bar:**

```jsx
// NoteEditor.jsx - Redesigned
<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

  {/* Compact Header */}
  <Box sx={{
    p: 2,
    borderBottom: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    alignItems: 'center',
    gap: 2
  }}>
    {/* Back button (mobile) */}
    <IconButton sx={{ display: { md: 'none' } }} onClick={() => navigate(-1)}>
      <ArrowLeft />
    </IconButton>

    {/* Title Input */}
    <TextField
      variant="standard"
      placeholder="Note title..."
      value={title}
      onChange={handleTitleChange}
      fullWidth
      InputProps={{
        disableUnderline: true,
        sx: { fontSize: '1.25rem', fontWeight: 600 }
      }}
    />

    {/* Note Type Badge */}
    <Chip
      icon={<NoteTypeIcon type={noteType} size={14} />}
      label={noteType}
      size="small"
      variant="outlined"
    />
  </Box>

  {/* Tag Bar */}
  <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
    <TagSelector
      selectedTags={selectedTags}
      onChange={handleTagsChange}
      compact
    />
  </Box>

  {/* Editor Area */}
  <Box sx={{ flex: 1, overflow: 'hidden' }}>
    {renderEditor()}
  </Box>

  {/* Floating Action Bar (Mobile) */}
  <Box sx={{
    display: { xs: 'flex', md: 'none' },
    position: 'fixed',
    bottom: 16,
    left: 16,
    right: 16,
    bgcolor: 'background.paper',
    borderRadius: 'xl',
    boxShadow: 'lg',
    p: 1,
    gap: 1,
    justifyContent: 'space-around'
  }}>
    <IconButton color="primary" onClick={handleSave}>
      <Save />
    </IconButton>
    <IconButton onClick={togglePreview}>
      <Eye />
    </IconButton>
    <IconButton color="error" onClick={() => setDeleteDialogOpen(true)}>
      <Trash2 />
    </IconButton>
  </Box>

  {/* Desktop Action Bar */}
  <Box sx={{
    display: { xs: 'none', md: 'flex' },
    p: 2,
    borderTop: '1px solid',
    borderColor: 'divider',
    gap: 2,
    justifyContent: 'flex-end'
  }}>
    <Button variant="outlined" color="error" startIcon={<Trash2 />}>
      Delete
    </Button>
    <Button variant="contained" startIcon={<Save />}>
      Save
    </Button>
  </Box>
</Box>
```

### 5. New Note Creation Flow

**Current Issues:**
- Type selection is small and easy to miss
- No visual preview of what each type looks like

**New Design - Type Selection Modal:**

```jsx
// NewNoteModal.jsx
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
  <DialogTitle>
    <Typography variant="h5" fontWeight={600}>
      Create New Note
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Choose a note type to get started
    </Typography>
  </DialogTitle>

  <DialogContent>
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 2,
      py: 2
    }}>
      {noteTypes.map(type => (
        <NoteTypeCard
          key={type.id}
          type={type}
          selected={selectedType === type.id}
          onClick={() => setSelectedType(type.id)}
        />
      ))}
    </Box>
  </DialogContent>

  <DialogActions sx={{ p: 2 }}>
    <Button onClick={onClose}>Cancel</Button>
    <Button
      variant="contained"
      onClick={handleCreate}
      disabled={!selectedType}
    >
      Create Note
    </Button>
  </DialogActions>
</Dialog>

// NoteTypeCard.jsx
<Card
  sx={{
    cursor: 'pointer',
    border: '2px solid',
    borderColor: selected ? 'primary.main' : 'transparent',
    transition: 'all 0.2s',
    '&:hover': { borderColor: 'primary.light' }
  }}
  onClick={onClick}
>
  <CardContent sx={{ textAlign: 'center', py: 3 }}>
    <Box sx={{
      width: 48,
      height: 48,
      borderRadius: 'lg',
      bgcolor: selected ? 'primary.main' : 'action.hover',
      color: selected ? 'primary.contrastText' : 'text.secondary',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      mx: 'auto',
      mb: 2
    }}>
      {type.icon}
    </Box>
    <Typography variant="subtitle1" fontWeight={600}>
      {type.label}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {type.description}
    </Typography>
  </CardContent>
</Card>
```

**Note Types Configuration:**
```jsx
const noteTypes = [
  {
    id: 'text',
    label: 'Rich Text',
    description: 'Formatted text with styling',
    icon: <Type size={24} />
  },
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'Write in markdown syntax',
    icon: <FileCode size={24} />
  },
  {
    id: 'code',
    label: 'Code',
    description: 'Syntax-highlighted code',
    icon: <Code size={24} />
  },
  {
    id: 'mindmap',
    label: 'Mind Map',
    description: 'Visual brainstorming',
    icon: <GitBranch size={24} />
  },
  {
    id: 'handwritten',
    label: 'Handwritten',
    description: 'Draw or write by hand',
    icon: <Pencil size={24} />
  }
];
```

### 6. Mobile Bottom Navigation

**New Component for Mobile:**

```jsx
// BottomNav.jsx
<Paper
  sx={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: { xs: 'block', md: 'none' },
    borderTop: '1px solid',
    borderColor: 'divider',
    zIndex: 1100
  }}
  elevation={3}
>
  <BottomNavigation value={currentTab} onChange={handleChange}>
    <BottomNavigationAction
      label="Notes"
      icon={<FileText />}
      value="/"
    />
    <BottomNavigationAction
      label="Tags"
      icon={<Tag />}
      value="/tags"
    />
    <BottomNavigationAction
      label="Settings"
      icon={<Settings />}
      value="/settings"
    />
  </BottomNavigation>
</Paper>
```

### 7. Search Component

**Redesigned for Better UX:**

```jsx
// SearchPage.jsx
<Box sx={{ p: 2, maxWidth: 800, mx: 'auto' }}>
  {/* Search Input */}
  <Paper sx={{ p: 1, mb: 3 }}>
    <TextField
      fullWidth
      placeholder="Search notes..."
      value={query}
      onChange={handleQueryChange}
      variant="standard"
      InputProps={{
        disableUnderline: true,
        startAdornment: (
          <InputAdornment position="start">
            <Search color="action" />
          </InputAdornment>
        ),
        endAdornment: query && (
          <IconButton size="small" onClick={clearSearch}>
            <X />
          </IconButton>
        ),
        sx: { fontSize: '1.1rem', py: 1 }
      }}
      autoFocus
    />
  </Paper>

  {/* Filter Chips */}
  <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
    <Chip
      label="All Types"
      variant={typeFilter === 'all' ? 'filled' : 'outlined'}
      onClick={() => setTypeFilter('all')}
    />
    {noteTypes.map(type => (
      <Chip
        key={type.id}
        icon={type.icon}
        label={type.label}
        variant={typeFilter === type.id ? 'filled' : 'outlined'}
        onClick={() => setTypeFilter(type.id)}
      />
    ))}
  </Box>

  {/* Results */}
  {isSearching ? (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  ) : results.length > 0 ? (
    <List>
      {results.map(note => (
        <SearchResultItem key={note._id} note={note} query={query} />
      ))}
    </List>
  ) : query ? (
    <EmptyState
      icon={<SearchX />}
      title="No results found"
      description={`No notes matching "${query}"`}
    />
  ) : (
    <EmptyState
      icon={<Search />}
      title="Search your notes"
      description="Find notes by title, content, or tags"
    />
  )}
</Box>
```

### 8. Login Page

**Modernized Design:**

```jsx
// Login.jsx
<Box sx={{
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'background.default',
  p: 2
}}>
  <Paper sx={{
    p: 4,
    maxWidth: 400,
    width: '100%',
    textAlign: 'center'
  }}>
    {/* Logo */}
    <Box sx={{ mb: 4 }}>
      <Box sx={{
        width: 64,
        height: 64,
        borderRadius: 'xl',
        bgcolor: 'primary.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        mx: 'auto',
        mb: 2
      }}>
        <BookOpen size={32} color="white" />
      </Box>
      <Typography variant="h4" fontWeight={700}>
        <Box component="span" sx={{ color: 'primary.main' }}>Note</Box>
        <Box component="span" sx={{ color: 'secondary.main' }}>Geek</Box>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Your thoughts, organized beautifully
      </Typography>
    </Box>

    {error && (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    )}

    <Button
      fullWidth
      variant="contained"
      size="large"
      onClick={handleSSOLogin}
      disabled={loading}
      sx={{
        py: 1.5,
        fontSize: '1rem',
        fontWeight: 600
      }}
    >
      {loading ? (
        <CircularProgress size={24} color="inherit" />
      ) : (
        'Continue with GeekSuite'
      )}
    </Button>

    <Typography variant="caption" color="text.tertiary" sx={{ mt: 3, display: 'block' }}>
      Powered by GeekBase Authentication
    </Typography>
  </Paper>
</Box>
```

---

## 🎭 Theme Configuration

### MUI Theme Setup

```jsx
// theme.js
import { createTheme } from '@mui/material/styles';

const getDesignTokens = (mode) => ({
  palette: {
    mode,
    primary: {
      main: mode === 'dark' ? '#3B82F6' : '#2563EB',
      light: mode === 'dark' ? '#60A5FA' : '#3B82F6',
      dark: mode === 'dark' ? '#2563EB' : '#1D4ED8',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: mode === 'dark' ? '#8B5CF6' : '#7C3AED',
      light: mode === 'dark' ? '#A78BFA' : '#8B5CF6',
      dark: mode === 'dark' ? '#7C3AED' : '#6D28D9',
      contrastText: '#FFFFFF',
    },
    background: {
      default: mode === 'dark' ? '#0F172A' : '#F8FAFC',
      paper: mode === 'dark' ? '#1E293B' : '#FFFFFF',
    },
    text: {
      primary: mode === 'dark' ? '#F8FAFC' : '#0F172A',
      secondary: mode === 'dark' ? '#94A3B8' : '#475569',
      disabled: mode === 'dark' ? '#64748B' : '#94A3B8',
    },
    divider: mode === 'dark' ? '#334155' : '#E2E8F0',
    error: { main: '#EF4444' },
    warning: { main: '#F59E0B' },
    success: { main: '#10B981' },
    info: { main: '#06B6D4' },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 600, letterSpacing: '-0.01em' },
    h4: { fontWeight: 600, letterSpacing: '-0.01em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
  },
});

export const createAppTheme = (mode) => createTheme(getDesignTokens(mode));
```

### Theme Provider with Persistence

```jsx
// ThemeContext.jsx
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { createAppTheme } from './theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('theme-mode');
    return saved || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const toggleTheme = () => {
    setMode(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeContext);
```

---

## 📁 New File Structure

```
client/src/
├── components/
│   ├── common/
│   │   ├── EmptyState.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── ThemeToggle.jsx
│   │   └── NoteTypeIcon.jsx
│   ├── layout/
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx
│   │   ├── BottomNav.jsx
│   │   └── Layout.jsx
│   ├── notes/
│   │   ├── NoteCard.jsx
│   │   ├── NoteList.jsx
│   │   ├── NoteEditor.jsx
│   │   ├── NoteHeader.jsx
│   │   ├── NoteTypeSelector.jsx
│   │   └── NewNoteModal.jsx
│   ├── editors/
│   │   ├── RichTextEditor.jsx
│   │   ├── MarkdownEditor.jsx
│   │   ├── CodeEditor.jsx
│   │   ├── MindMapEditor.jsx
│   │   ├── MindMapNode.jsx
│   │   └── HandwrittenEditor.jsx
│   ├── tags/
│   │   ├── TagSelector.jsx
│   │   ├── TagTree.jsx
│   │   ├── TagChip.jsx
│   │   └── TagContextMenu.jsx
│   ├── search/
│   │   ├── SearchInput.jsx
│   │   ├── SearchResults.jsx
│   │   └── SearchResultItem.jsx
│   └── auth/
│       ├── Login.jsx
│       └── ProtectedRoute.jsx
├── pages/
│   ├── HomePage.jsx
│   ├── NotePage.jsx
│   ├── SearchPage.jsx
│   ├── TagPage.jsx
│   ├── SettingsPage.jsx
│   └── LoginPage.jsx
├── theme/
│   ├── theme.js
│   ├── ThemeContext.jsx
│   └── colors.js
├── hooks/
│   ├── useThemeMode.js
│   ├── useMediaQuery.js
│   └── useDebounce.js
├── store/
│   ├── authStore.js
│   ├── noteStore.js
│   ├── tagStore.js
│   └── uiStore.js
├── services/
│   └── api.js
├── utils/
│   ├── formatters.js
│   └── constants.js
├── App.jsx
├── main.jsx
└── index.css
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1)
1. ✅ Create design system documentation
2. Remove Mantine, consolidate on MUI
3. Replace icons with Lucide
4. Add Inter and JetBrains Mono fonts
5. Implement new theme with dark/light mode
6. Create ThemeContext with persistence

### Phase 2: Layout (Week 2)
1. Redesign Header with Note/Geek branding
2. Implement responsive Layout component
3. Create mobile BottomNav
4. Redesign Sidebar with collapsible behavior
5. Add theme toggle to header

### Phase 3: Note List & Cards (Week 3)
1. Create new NoteCard component
2. Implement grid layout for NoteList
3. Add note type indicators
4. Improve tag display on cards
5. Add hover animations

### Phase 4: Note Editor (Week 4)
1. Redesign editor header
2. Create floating action bar for mobile
3. Implement NewNoteModal with type selection
4. Update all editor components for new theme
5. Improve mobile touch targets

### Phase 5: Search & Tags (Week 5)
1. Redesign SearchPage
2. Add type filter chips
3. Improve TagTree component
4. Create TagPage for browsing by tag
5. Add empty states

### Phase 6: Polish (Week 6)
1. Add transitions and animations
2. Implement loading skeletons
3. Add haptic feedback (mobile)
4. Performance optimization
5. Accessibility audit
6. Cross-browser testing

---

## 🧪 Testing Checklist

### Responsive Testing
- [ ] iPhone SE (375px)
- [ ] iPhone 14 Pro (393px)
- [ ] iPad Mini (768px)
- [ ] iPad Pro (1024px)
- [ ] Desktop (1280px+)

### Feature Testing
- [ ] Create note of each type
- [ ] Edit existing notes
- [ ] Delete notes
- [ ] Tag management
- [ ] Search functionality
- [ ] Mind map interactions
- [ ] Handwritten note drawing
- [ ] Theme switching
- [ ] SSO login flow

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Color contrast (WCAG AA)
- [ ] Focus indicators
- [ ] Touch target sizes (44px min)

---

## 📝 Notes for Implementation

1. **Preserve all existing functionality** - This is a visual refresh, not a feature change
2. **Mobile-first approach** - Design for phone, enhance for desktop
3. **Progressive enhancement** - Core features work without JS animations
4. **Performance budget** - Keep bundle size increase minimal
5. **Backwards compatibility** - Existing notes should render correctly

---

## 🎨 Visual Reference

### Color Swatches

| Name | Dark Mode | Light Mode | Usage |
|------|-----------|------------|-------|
| Primary | `#3B82F6` | `#2563EB` | "Note" text, primary buttons |
| Secondary | `#8B5CF6` | `#7C3AED` | "Geek" text, accents |
| Background | `#0F172A` | `#F8FAFC` | Page background |
| Surface | `#1E293B` | `#FFFFFF` | Cards, modals |
| Text Primary | `#F8FAFC` | `#0F172A` | Headings, body |
| Text Secondary | `#94A3B8` | `#475569` | Descriptions |
| Border | `#334155` | `#E2E8F0` | Dividers, outlines |

---

*Last Updated: December 17, 2024*
*Version: 1.0*
