# Handwritten Editor Mobile Touch Fix

## Problem Summary

On mobile devices (tested with active stylus, passive stylus, and finger input), the tldraw-based handwritten editor exhibits:
1. **Touch offset**: Drawing appears 1-2 inches below where the user touches
2. **Fragmented strokes**: Only fragments of writing are captured, especially on upstrokes
3. **Desktop works fine**: Mouse input on desktop renders accurately

---

## Root Cause Analysis

### 1. Scrollable Parent Container Interference

The `NoteShell` component wraps the editor content in a scrollable `<Box>`:

```jsx
// NoteShell.jsx lines 58-67
<Box
  sx={{
    flexGrow: 1,
    overflow: 'auto',  // <-- This creates a scrollable container
    position: 'relative',
    minHeight: 0,
  }}
>
  {children}
</Box>
```

**Why this matters:**
- tldraw calculates touch coordinates using `getBoundingClientRect()`
- When embedded in a scrollable container, the scroll offset is not automatically accounted for
- Touch events report coordinates relative to the viewport, but tldraw expects coordinates relative to its canvas
- This causes the "1-2 inch offset" symptom

### 2. Touch Event Bubbling

On iOS specifically (and some Android browsers), touch events that bubble beyond the canvas element trigger browser scroll/pan behavior. This causes:
- Interrupted strokes (fragmented writing)
- Competing gestures between drawing and scrolling

### 3. Missing `touch-action: none` CSS

The tldraw component needs explicit CSS to prevent browser touch handling:

```css
touch-action: none;
```

Without this, the browser may:
- Interpret drawing gestures as scroll attempts
- Cancel pointer events mid-stroke
- Apply momentum scrolling during drawing

---

## Recommended Fix

### Option A: Dedicated Full-Screen Layout for Handwritten Notes (Recommended)

Create a dedicated layout that removes the scrollable parent entirely for handwritten notes.

**Changes required:**

1. **Modify `NotePage.jsx`** to use a full-viewport layout for handwritten notes (similar to existing mindmap handling):

```jsx
// Add handwritten to the full-height layout condition
if (noteToDisplay && (noteToDisplay.type === 'mindmap' || noteToDisplay.type === 'handwritten')) {
    return renderEditor();  // Already uses full-height layout
}
```

2. **Update `HandwrittenEditor.jsx`** to ensure proper CSS:

```jsx
return (
    <Box
        sx={{
            width: '100%',
            height: '100%',
            minHeight: 420,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            touchAction: 'none',  // Prevent browser touch handling
            '& .tl-container': {
                touchAction: 'none',
            },
            '& .tl-canvas': {
                touchAction: 'none',
            }
        }}
    >
        <Tldraw onMount={handleMount} readOnly={readOnly} />
    </Box>
);
```

3. **Modify `NoteShell.jsx`** to disable scrolling for handwritten notes:

Pass a prop like `disableScroll` and conditionally set `overflow: 'hidden'` instead of `overflow: 'auto'`.

### Option B: Touch Event Prevention (Fallback)

If Option A is not feasible, add touch event handlers to prevent bubbling:

```jsx
const handleTouchEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
};

return (
    <Box
        onTouchStart={handleTouchEvent}
        onTouchMove={handleTouchEvent}
        onTouchEnd={handleTouchEvent}
        onTouchCancel={handleTouchEvent}
        sx={{ ... }}
    >
        <Tldraw ... />
    </Box>
);
```

**Caveat:** This may interfere with tldraw's internal touch handling. Test thoroughly.

---

## Implementation Steps

### Step 1: Update HandwrittenEditor.jsx

Add proper CSS and positioning:

```jsx
import React, { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

const HandwrittenEditor = ({ content, setContent, readOnly = false }) => {
    // ... existing refs and callbacks ...

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                position: 'absolute',
                inset: 0,
                touchAction: 'none',
                overflow: 'hidden',
                '& .tl-container, & .tl-canvas': {
                    touchAction: 'none !important',
                }
            }}
        >
            <Tldraw onMount={handleMount} readOnly={readOnly} />
        </Box>
    );
};
```

### Step 2: Update NoteShell.jsx

Add a `disableContentScroll` prop:

```jsx
function NoteShell({
  header,
  children,
  actions,
  toolbar,
  fullHeight = true,
  disableContentScroll = false  // NEW PROP
}) {
  return (
    <Box sx={{ ... }}>
      {/* ... header and toolbar ... */}

      <Box
        sx={{
          flexGrow: 1,
          overflow: disableContentScroll ? 'hidden' : 'auto',  // CONDITIONAL
          position: 'relative',
          minHeight: 0,
        }}
      >
        {children}
      </Box>

      {/* ... actions ... */}
    </Box>
  );
}
```

### Step 3: Update NoteEditorPage.jsx

Pass the prop for handwritten notes:

```jsx
const isHandwritten = noteType === NOTE_TYPES.HANDWRITTEN;

<NoteShell
  header={...}
  actions={...}
  disableContentScroll={isHandwritten}  // NEW
>
  <NoteTypeRouter ... />
</NoteShell>
```

### Step 4: Update NotePage.jsx

Ensure handwritten notes get the full-height treatment like mindmaps:

```jsx
// Line ~185 - add handwritten to the condition
if (noteToDisplay && (noteToDisplay.type === 'mindmap' || noteToDisplay.type === 'handwritten')) {
    return renderEditor();
}
```

---

## Testing Checklist

After implementing the fix, verify:

- [ ] **Desktop mouse**: Drawing works accurately (regression test)
- [ ] **Mobile finger**: Strokes appear where touched, no offset
- [ ] **Mobile passive stylus**: Strokes appear where touched, no offset
- [ ] **Mobile active stylus**: Strokes appear where touched, no offset
- [ ] **Continuous strokes**: Long strokes don't fragment or skip
- [ ] **Two-finger gestures**: Pan/zoom still work within tldraw canvas
- [ ] **Page doesn't scroll**: Parent page doesn't scroll while drawing
- [ ] **Save works**: Content saves correctly after drawing
- [ ] **Load works**: Existing handwritten notes load correctly

---

## Related Issues

- [tldraw #2725](https://github.com/tldraw/tldraw/issues/2725) - Touch action and overscroll behaviour for inline components
- [tldraw #4583](https://github.com/tldraw/tldraw/issues/4583) - Scroll jumps in scrollable container
- iOS `touch-action: none` requires `event.preventDefault()` on touch handlers (post iOS 11.3)

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/editors/HandwrittenEditor.jsx` | Add absolute positioning, touch-action CSS |
| `client/src/components/notes/NoteShell.jsx` | Add `disableContentScroll` prop |
| `client/src/pages/NoteEditorPage.jsx` | Pass `disableContentScroll` for handwritten |
| `client/src/pages/NotePage.jsx` | Add handwritten to full-height layout condition |

---

## Summary

The mobile touch offset issue is caused by tldraw being embedded in a scrollable container. The fix involves:
1. Removing scroll from the parent container for handwritten notes
2. Using absolute positioning for the tldraw container
3. Adding `touch-action: none` CSS to prevent browser interference

This is a layout/CSS issue, not a tldraw bug.
