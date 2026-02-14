# Morning Review Checklist ☕

## Quick Start

```bash
docker compose down
docker compose up --build
```

## ✅ Features to Test

### 1. Chord Reference (NEW!)

**Location**: Header → "Chords" button (only shows for Guitar)

**Test Steps**:

1. Select Guitar as instrument
2. Navigate to any lesson
3. Click "Chords" button in header
4. Should see fullscreen overlay with chord grid
5. Click any chord → enlarged view with tips appears
6. Click X or backdrop to close

**Expected Behavior**:

- Grid shows Major and Minor chords
- Beginner Essentials section at bottom
- Click chord = floating detail panel
- Responsive on mobile
- Button highlights when open

---

### 2. Metronome (REDESIGNED!)

**Location**: Header → "Metronome" button

**Test Steps**:

1. Click "Metronome" button
2. Should see small draggable modal (260px wide)
3. Default view shows:
   - BPM display with +/- buttons
   - Tempo slider
   - Volume slider
   - Start/Stop button
4. Click "Advanced" accordion
5. Should expand to show:
   - Time signatures
   - Subdivisions
   - Tempo presets
   - Beat indicator (when playing)

**Expected Behavior**:

- Much more compact than before
- Draggable by header
- No wasted space
- All advanced features hidden by default
- Button highlights when open

---

### 3. Tuner (EXISTING - Should Still Work)

**Location**: Header → "Tuner" button

**Test Steps**:

1. Click "Tuner" button
2. Should see fullscreen overlay
3. Click X or backdrop to close
4. Should return to previous location

**Expected Behavior**:

- Takes over screen
- No navigation
- Returns to same spot when closed
- Button highlights when open

---

## 🐛 Known Issues to Verify

### Metronome Display

**Issue**: Changes weren't appearing in Docker
**Fix Applied**: Added `usePolling: true` to vite.config.js
**Verify**: Metronome should show new compact design

### Button States

**Issue**: Tuner button was always blue
**Fix Applied**: Changed to dynamic active state
**Verify**: Buttons only highlight when their tool is open

---

## 📁 Files Changed

### New Files

- `/frontend/src/components/ChordReference.jsx`
- `/NIGHT_SHIFT_NOTES.md`
- `/MORNING_REVIEW_CHECKLIST.md` (this file)

### Modified Files

- `/frontend/src/components/Header.jsx` - Added chord reference
- `/frontend/src/components/Metronome.jsx` - Redesigned UI
- `/frontend/src/components/Metronome.css` - Compact styling
- `/frontend/src/App.css` - Chord reference + metronome styles
- `/frontend/vite.config.js` - Added polling for Docker

---

## 🎯 Success Criteria

✅ **Chord Reference**

- [ ] Button appears for Guitar only
- [ ] Opens fullscreen overlay
- [ ] Shows all chords in grid
- [ ] Click chord shows detail panel
- [ ] Responsive on mobile
- [ ] Button shows active state

✅ **Metronome**

- [ ] Shows new compact design (260px)
- [ ] Default view is minimal
- [ ] Advanced accordion works
- [ ] Draggable
- [ ] No wasted space
- [ ] Button shows active state

✅ **Tuner**

- [ ] Still works as before
- [ ] Button shows active state (not always blue)
- [ ] Returns to previous location

✅ **General**

- [ ] All three tools work as overlays
- [ ] No navigation/page changes
- [ ] Stay in lesson context
- [ ] Mobile responsive
- [ ] Docker HMR works

---

## 🚀 If Everything Works

Consider these next steps:

1. Add more chord types (7ths, sus, etc.)
2. Create similar references for other instruments
3. Add search/filter to chord reference
4. Add favorites system
5. Create jam track player
6. Add practice time tracker

---

## 🔥 If Something's Broken

1. Check browser console for errors
2. Verify Docker containers are running
3. Try hard refresh (Cmd+Shift+R)
4. Check `/NIGHT_SHIFT_NOTES.md` for details
5. All code is in place - likely just needs cache clear

---

**Ready for review!** ☕🎸

_Built with care by Sage during the night shift_
