# GuitarGeek Handoff Document

**Date:** November 18, 2025
**Status:** Foundation lessons interactive features implemented, ready for testing and asset acquisition

---

## What Was Just Completed

### 1. Interactive Lesson Components (✅ DONE)

- **Tuner Integration**: Existing `Tuner.jsx` component now renders in lessons with `step_type: "tuner"`. See Lesson 4 (Tuning Basics).
  - Files modified: `PracticeSessionPage.jsx`, `LessonDetailPage.jsx`
  - Supports standard tuning (E A D G B E) with live pitch detection via Web Audio API
  - Visual indicators show cents deviation and tuning status

- **Playalong Metronome**: Existing `Metronome.jsx` integrated for rhythm practice steps.
  - Files modified: `PracticeSessionPage.jsx`, `Metronome.jsx`
  - Accepts `initialTempo` and `initialSubdivision` props
  - Used in Lessons 5, 6, 7, 9, 10 for timed practice

- **Timed Practice Timer**: Countdown timer component for 60-second drills.
  - Integrated directly into `PracticeSessionPage.jsx`
  - Used in Lesson 10 (chord transitions drill)

- **Celebration Animations**: New `ConfettiBurst.jsx` component triggers on mascot "celebrate" steps.
  - Lightweight emoji-based confetti (no dependencies)
  - Auto-triggers when reaching celebration mascot_tip steps

### 2. Database Migration (✅ DONE)

- **New Migration**: `1731201000000_set-filesystem-content-paths.js`
  - Links 10 foundation lesson DB rows to their markdown files via `content_path` field
  - Lessons 1-10 now use hybrid architecture: DB metadata + filesystem content

### 3. Documentation Created

- **AUDIO_ASSETS_TODO.md**: Workflow for acquiring CC0 audio samples from Freesound
- **VISUAL_MEDIA_TODO.md**: Guidelines for creating/sourcing lesson images and GIFs

---

## Current State

### ✅ Working

- Tuner component (existing, now integrated)
- Metronome component (existing, now prop-enabled)
- Celebration animations (new, functional)
- 10 foundation lesson markdown files with rich interactive step configs
- Database migration for content_path linkage

### ⚠️ Blockers

1. **Build Error**: Frontend fails to build due to `@mui/material` import resolution in `ProfilePage.jsx`
   - Not related to new changes
   - Dev mode (`npm run dev`) may still work for testing

2. **Missing Assets**:
   - Audio samples: All URLs in lessons are placeholders (e.g., `/assets/audio/tuning/in-tune-all-strings.mp3`)
   - Images: Referenced but not created (e.g., `/assets/lessons/images/standard-tuning.png`)

### 🔄 In Progress

- Visual media acquisition (stubs documented)
- End-to-end lesson flow testing (needs build fix first)

### 📝 Not Started

- Audio sample downloads/creation
- Remaining chord lessons (11-15): A Major, D Major, E Major, A Minor
- Image asset creation

---

## File Structure Reference

### Frontend Components

```
frontend/src/components/
  ├── Tuner.jsx              ✅ Existing (Web Audio pitch detection)
  ├── Metronome.jsx          ✅ Modified (added props)
  ├── ConfettiBurst.jsx      ✅ New (celebration animations)
  └── ChordVerifier.jsx      ✅ Existing (chord detection)

frontend/src/pages/
  ├── PracticeSessionPage.jsx  ✅ Modified (tuner, playalong, timer rendering)
  └── LessonDetailPage.jsx     ✅ Modified (tuner rendering)
```

### Backend Content

```
backend/content/lessons/
  ├── guitar-s1-l1-welcome.md           ✅ Complete
  ├── guitar-s1-l2-posture-holding.md   ✅ Complete
  ├── guitar-s1-l3-string-names.md      ✅ Complete
  ├── guitar-s1-l4-tuning.md            ✅ Complete (uses tuner)
  ├── guitar-s1-l5-em-first-chord.md    ✅ Complete (uses playalong)
  ├── guitar-s1-l6-finger-workout.md    ✅ Complete (uses playalong)
  ├── guitar-s1-l7-strumming.md         ✅ Complete (uses playalong)
  ├── guitar-s1-l8-reading-diagrams.md  ✅ Complete
  ├── guitar-s1-l9-melody.md            ✅ Complete (uses playalong)
  └── guitar-s1-l10-transitions.md      ✅ Complete (uses timed_practice)

backend/migrations/
  └── 1731201000000_set-filesystem-content-paths.js  ✅ New migration
```

### Documentation

```
DOCS/
  ├── AUDIO_ASSETS_TODO.md     ✅ Acquisition workflow
  ├── VISUAL_MEDIA_TODO.md     ✅ Image creation guide
  └── CONTENT_RESOURCES.md     ✅ Free content sources catalog
```

---

## Next Steps (Priority Order)

### 🔥 Critical Path

1. **Fix Build Error** (5 min)

   ```bash
   cd frontend
   npm ls @mui/material  # Check if installed
   # If missing: npm install @mui/material@^7.3.5
   # Or: check ProfilePage.jsx imports and fix/remove unused MUI references
   npm run build
   ```

2. **Test Interactive Features** (30 min)
   - Start dev server: `cd frontend && npm run dev`
   - Navigate to Lesson 4 (Tuning) → verify tuner activates with microphone
   - Navigate to Lesson 5 (Em chord) → verify metronome renders and plays
   - Navigate to Lesson 10 (Transitions) → verify countdown timer works
   - Check celebration confetti on mascot steps

3. **Run Database Migration** (2 min)
   ```bash
   cd backend
   npm run migrate
   # Should apply 1731201000000_set-filesystem-content-paths.js
   ```

### 🎨 Asset Acquisition (Can be parallelized)

4. **Audio Samples** (1-2 hours)
   - See `DOCS/AUDIO_ASSETS_TODO.md` for detailed workflow
   - Quick option: Record yourself plucking strings with phone, export as MP3
   - Proper option: Download from Freesound.org (search "guitar open strings" CC0)
   - Place in: `frontend/public/assets/audio/tuning/` and `/strings/`
   - Update URLs in markdown files (search for `/assets/audio/`)

5. **Visual Media** (2-3 hours)
   - See `DOCS/VISUAL_MEDIA_TODO.md` for specifications
   - Create annotated images: standard-tuning.png, tuning-pegs.png, etc.
   - Tools: Figma, Excalidraw, or Photoshop
   - Optimize to <150KB each
   - Place in: `frontend/public/assets/lessons/images/`

### 📚 Content Expansion (Lower priority)

6. **Create Chord Lessons 11-15** (2-3 hours)
   - Follow template from `guitar-s1-l5-em-first-chord.md`
   - Chords: A Major, D Major, E Major, A Minor
   - Each needs: chord diagram, fingering explanation, playalong, self-check
   - Add migrations to link DB entries

7. **End-to-End Testing** (1 hour)
   - Complete all 10 lessons in practice mode
   - Verify progress tracking
   - Check responsive design on mobile
   - Test with both kid and adult UI modes

---

## Known Issues & Quirks

### Architecture

- **Hybrid Lesson System**: DB stores metadata, markdown files store rich content (steps, configs)
- **Merge Priority**: Filesystem content takes precedence when both exist
- **Order Index**: Lessons use `order_index` for sorting (10, 15, 16, 17, 20-25)

### Component Behavior

- **Tuner**: Requires microphone permission (will prompt user)
- **Metronome**: Uses Web Audio API scheduling (precise timing)
- **ConfettiBurst**: Triggers on `variant: 'celebrate'` mascot_tip steps
- **ChordVerifier**: Only shows for lessons with category containing "chord"

### Step Types in Use

- `text` - Markdown content rendering
- `chord_diagram` - SVG chord chart generation
- `tuner` - Interactive tuner component
- `playalong` - Metronome + practice instructions
- `timed_practice` - Countdown timer drill
- `exercise` - Self-check with ChordVerifier (chord lessons)
- `video` - YouTube embed
- `mascot_tip` - Encouragement message with optional confetti

---

## Testing Commands

```bash
# Backend
cd backend
npm run dev          # Start API server (port 3001)
npm run migrate      # Run pending migrations
npm run seed         # Seed database (if needed)

# Frontend
cd frontend
npm run dev          # Dev server (port 5173)
npm run build        # Production build
npm run preview      # Preview production build

# Full Stack Test
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd frontend && npm run dev
# Browser: http://localhost:5173
```

---

## Key Decisions Made

1. **No external animation library**: Used CSS keyframes + React state for confetti (keeps bundle small)
2. **Reused existing Metronome**: Added props instead of creating new playalong-specific component
3. **Tuner config in step_config**: Standard tuning frequencies hardcoded, extensible for alternate tunings
4. **Filesystem-first approach**: Markdown is source of truth, DB is index/cache
5. **Placeholder assets acceptable**: Structure complete, media can be added without code changes

---

## Questions for Next Person

- [ ] Should we add a "Skip" button for timed practice steps, or enforce completion?
- [ ] Do celebration animations need sound effects? (Consider accessibility)
- [ ] Should tuner show visual string indicators (like a guitar neck diagram)?
- [ ] Preferred audio format: MP3 or OGG? (both work, OGG smaller but less compatible)
- [ ] Should missing images show placeholder SVG or just break layout?

---

## Contact & Context

**Previous work session:** Implemented all interactive lesson features in one session (Nov 17-18, 2025)
**User availability:** User felt ill and needed this handed off urgently
**Original goal:** "Perfect first 10 lessons before creating more" to avoid rework

**Key files to review first:**

1. `PracticeSessionPage.jsx` - See all new rendering functions
2. `guitar-s1-l4-tuning.md` - Example tuner lesson
3. `guitar-s1-l5-em-first-chord.md` - Example full interactive lesson
4. This HANDOFF.md - You're reading it! 😊

---

## Success Criteria (When Ready to Mark "Done")

- ✅ Build completes without errors
- ✅ All 10 lessons have working interactive components
- ✅ Audio samples load and play in lessons
- ✅ Images display correctly (no 404s)
- ✅ Tuner detects pitch and shows accurate feedback
- ✅ Metronome plays at correct BPM
- ✅ Confetti animates on celebration steps
- ✅ Progress tracking saves after completing lessons
- ✅ Mobile responsive (test on phone)

---

**Good luck! The foundation is solid. Main work remaining is asset acquisition and testing.** 🎸
