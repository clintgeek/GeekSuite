# MusicGeek Metronome – Implementation Plan

This document guides the metronome refactor. The goal is a **simple, reliable, kid-friendly** metronome that feels like a physical music-store metronome—not a tech demo.

---

## Non-Negotiables (Experience Requirements)

Before touching any code, internalize these:

| Requirement        | What it means                                                    |
| ------------------ | ---------------------------------------------------------------- |
| **Immediate**      | First click → sound within ~1 beat. No "is it on?" ambiguity.    |
| **Predictable**    | Tempo changes are obvious. No hidden state.                      |
| **Visible rhythm** | You can _see_ the beat. Sound alone is not enough for beginners. |
| **Hard to misuse** | Can't set nonsense values. Can't lose track of where you are.    |

Everything else is secondary.

---

## Current State Assessment

**Files:**

- `frontend/src/components/Metronome.jsx` – main component (~183 lines)
- `frontend/src/components/Metronome.css` – styles (~608 lines, lots of unused cruft)
- `frontend/src/pages/MetronomePage.jsx` – thin wrapper

**What exists:**

- Web Audio API oscillator-based clicks ✓
- Tempo slider (40–240 BPM) ✓
- Subdivision slider ✓
- Start/Stop button ✓
- Accent on downbeat (different frequency) ✓
- Time signature support (defined but selector hidden)

**What's broken or missing:**

- ❌ No visual beat indicator (pulse circle, pendulum, etc.)
- ❌ No immediate click on start—silent warm-up possible
- ❌ Tempo changes apply mid-beat (jarring)
- ❌ Sliders instead of buttons (precision dragging, bad for kids)
- ❌ No "what beat am I on?" visibility
- ❌ Lots of dead CSS for features that don't exist

---

## V1 Scope – The Minimal Correct Metronome

### Core Controls (only these)

1. **Tempo**
   - Big number (BPM) – already exists
   - **Replace slider with +/– buttons** (big touch targets)
   - Range: 40–240 BPM
   - Tap-tempo is **v2** (not this sprint)

2. **Start / Stop**
   - Single large toggle – already exists
   - Clear state change (color + label) – already exists
   - **Fix:** Play immediate click on start (no silent warm-up)

3. **Accent**
   - First beat of measure is different – already exists (frequency)
   - **Add:** Visual accent (pulse circle color change)

4. **Visual Rhythm – Pulse Circle** (new)
   - A circle that grows/shrinks on each beat
   - Changes color on accented beat
   - This is the #1 missing piece

### What to Remove for V1

- Subdivision slider (move to v2 or hide behind "Advanced")
- Time signature selector (keep 4/4 default, v2 for others)
- Any unused CSS classes

---

## Implementation Checklist

### Phase 1: Immediate Feedback Fixes

- [ ] **1.1 – Immediate click on start**
  - When user hits Start, schedule a click at `audioContext.currentTime + 0.01` (essentially now)
  - Don't wait for the first interval tick
  - File: `Metronome.jsx`, inside `togglePlay` or the `useEffect` that starts the interval

- [ ] **1.2 – Visual state clarity**
  - Ensure button shows "Stop" (red) when playing, "Start" (blue) when stopped
  - Already partially done—verify it's obvious at a glance

### Phase 2: Pulse Circle (Visual Rhythm)

- [ ] **2.1 – Add pulse circle element**
  - Create a `<div className="pulse-circle">` inside the component
  - Position it prominently (above or beside the tempo display)

- [ ] **2.2 – Animate on beat**
  - Track `currentBeat` in state (already exists but unused in render)
  - On each beat tick, trigger a CSS animation or scale transform
  - Use `transform: scale(1.2)` → `scale(1.0)` with `transition: transform 0.1s ease-out`
  - **Important:** Drive visual pulse from the same beat tick that schedules audio—don't use a separate timer

> ⚠️ **Audio/visual sync note:**
>
> - Audio time (Web Audio API) is authoritative
> - Visuals are "best effort"—don't try to correct drift aggressively
> - Beginners don't notice small drift, but jitter is very noticeable

- [ ] **2.3 – Accent color**
  - On beat 0 (downbeat), pulse circle turns accent color (e.g., `#3b82f6` blue)
  - On other beats, pulse circle is neutral (e.g., `#64748b` gray)

- [ ] **2.4 – CSS for pulse circle**

  ```css
  .pulse-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #64748b;
    transition:
      transform 0.1s ease-out,
      background 0.1s ease;
    margin: 1rem auto;
  }

  .pulse-circle--beat {
    transform: scale(1.15);
  }

  .pulse-circle--accent {
    background: #3b82f6;
  }
  ```

### Phase 3: Replace Sliders with Buttons

- [ ] **3.1 – Tempo +/– buttons**
  - Replace tempo slider with:
    ```jsx
    <button onClick={() => setTempo(t => Math.max(40, t - 5))}>−</button>
    <span className="tempo-value">{tempo}</span>
    <button onClick={() => setTempo(t => Math.min(240, t + 5))}>+</button>
    ```
  - Buttons should be **large** (min 44×44px touch target)
  - Hold-to-repeat is nice-to-have (v2)

- [ ] **3.2 – Remove subdivision slider for v1**
  - Either delete or hide behind an "Advanced" toggle
  - Default to quarter notes (subdivision = 1)

### Phase 4: Tempo Change Behavior

- [ ] **4.1 – Apply tempo on next beat**
  - When tempo changes while playing, don't restart the interval immediately
  - Instead, let the current beat finish, then apply new interval timing
  - This prevents jarring mid-beat changes
  - Implementation: store `pendingTempo` and apply it in the tick function when a beat completes

- [ ] **4.2 – Optional: Show pending tempo**
  - If tempo is changing, briefly show "120 → 100" to indicate the change is queued
  - Nice-to-have, not required for v1

> ⚠️ **Keep pendingTempo dead simple:**
>
> - Only one pending tempo at a time
> - New tempo replaces old pending tempo
> - Apply on next beat boundary, done
> - No queued changes, no interpolation—that's v2 cleverness

### Phase 5: Beat Count Indicator (Optional but Recommended)

- [ ] **5.1 – Add beat count row**
  - Display a simple "1 2 3 4" row (based on time signature beats)
  - Current beat is bolded or filled
  - No animation, no interaction—just static highlighting

  ```jsx
  <div className="beat-count-row">
    {[1, 2, 3, 4].map((n) => (
      <span key={n} className={currentBeat === n - 1 ? 'beat-count--active' : ''}>
        {n}
      </span>
    ))}
  </div>
  ```

- [ ] **5.2 – CSS for beat count**

  ```css
  .beat-count-row {
    display: flex;
    justify-content: center;
    gap: 1rem;
    font-size: 1.25rem;
    font-weight: 500;
    color: #64748b;
    margin: 0.5rem 0;
  }

  .beat-count--active {
    font-weight: 700;
    color: #f8fafc;
  }
  ```

**Why this helps:**

- Reinforces where you are in the measure
- Helps kids internalize counting
- Costs almost nothing cognitively

### Phase 6: CSS Cleanup

- [ ] **6.1 – Remove dead CSS**
  - Delete unused classes (`.beat-indicator`, `.beat-wrapper`, `.beat`, `.presets-section`, etc.)
  - Keep only what's actually rendered

- [ ] **6.2 – Ensure big touch targets**
  - All interactive elements: min 44×44px
  - No tiny sliders or precision controls

---

## Audio Polish (Quick Wins)

- [ ] Use short, clean click (current 0.05s duration is fine)
- [ ] Accented beat: lower pitch (1000Hz → 880Hz) or keep current differentiation
- [ ] No reverb, no tail—dry and boring = accurate

---

## Definition of Done

You're done when:

- [ ] A kid can start it without asking how
- [ ] Tempo changes don't surprise anyone
- [ ] You can mute the sound and still follow the beat visually (pulse circle)
- [ ] Nothing about it feels "techy"
- [ ] Glancing at the screen for <1 second tells you: Is it running? What tempo? What beat?

---

## Architecture Notes

**Keep the metronome sealed:**

- No shared state except `tempo` and `isPlaying` (if needed by parent)
- No clever reuse elsewhere
- This prevents it from infecting the rest of the app

**Props interface (keep minimal):**

```typescript
interface MetronomeProps {
  initialTempo?: number; // default 120
  compact?: boolean; // layout variant
  onTempoChange?: (bpm: number) => void; // optional callback
}
```

---

## File Changes Summary

| File                                    | Action                            |
| --------------------------------------- | --------------------------------- |
| `frontend/src/components/Metronome.jsx` | Refactor per phases 1–4           |
| `frontend/src/components/Metronome.css` | Cleanup + add pulse circle styles |
| `frontend/src/pages/MetronomePage.jsx`  | No changes needed                 |

---

## Out of Scope (V2+)

- Tap-tempo
- Time signature selector
- Subdivision options
- Presets (Largo, Allegro, etc.)
- Volume control
- Sound sample selection
- Pendulum animation

---

## Testing Checklist

Before marking complete, verify:

1. [ ] Start → immediate click heard
2. [ ] Pulse circle animates on every beat
3. [ ] Downbeat pulse is visually distinct (color)
4. [ ] +/– buttons change tempo in 5 BPM increments
5. [ ] Tempo changes while playing don't cause audio glitches
6. [ ] Works on mobile (touch targets large enough)
7. [ ] Works with sound muted (visual rhythm still clear)
8. [ ] Stop resets beat counter to 0

---

_"If it feels like a physical metronome you bought at a music store, you win."_
