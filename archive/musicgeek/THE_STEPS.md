# MusicGeek Lessons – Current Steps

This file tracks the **near-term, actionable steps** for the lesson/path rearchitecture.

## Phase 1 – Backend & content sync

- [ ] **Update `Lesson` model** (`backend/src/models/Lesson.js`)
  - Add `slug: { type: String, unique: true, index: true }`.
  - Add `template: { type: String }`.
  - Add `content: { type: mongoose.Schema.Types.Mixed }`.
  - Keep existing `steps` field for now.

- [ ] **Create `LearningPath` model** (`backend/src/models/LearningPath.js`)
  - Fields: `slug`, `instrumentId`, `level`, `audience`, `trackType`, `isDefault`, `template`, `content`.

- [ ] **Define initial JSON content files**
  - `backend/content/lessons/guitar-welcome.json`
    - Contains: `slug`, `template`, `meta` (title, difficulty, audience, etc.), and `content` (learning outcomes + steps).
  - `backend/content/paths/guitar-beginner-kid-main.json`
    - Contains: `slug`, `instrumentSlug`, `level`, `audience`, and `content.units[]` referencing `lessonSlug`s.

- [ ] **Implement `sync-content` script** (`backend/scripts/sync-content.js`)
  - Connects to Mongo via existing config.
  - Reads all JSON lessons and paths.
  - Upserts into `lessons` and `learning_paths` by `slug`.
  - Safe to run multiple times.

- [ ] **Add npm script for content sync**
  - In `package.json` or backend `package.json`, add e.g.:
    - `"content:sync": "node backend/scripts/sync-content.js"`.
  - Document usage in `walkthrough.md` or `DOCS/`.

## Phase 2 – Lesson templates (frontend)

- [ ] **Add `lessonTemplateRegistry` and `LessonTemplateRenderer`**
  - Location: `frontend/src/lessonTemplates/` (new folder) or similar.
  - Registry: maps `template` key → React component.

- [ ] **Implement `guided_steps_v1` template**
  - Uses Duolingo-style guided session UI (progress bar, central step card, coach panel).
  - Consumes `lesson.content.steps` (not the legacy `lesson.steps`).

- [ ] **Wire Practice Session to templates**
  - Update `PracticeSessionPage` to render via `LessonTemplateRenderer`.
  - Keep the API contract compatible while we’re in transition.

## Phase 3 – Paths & selection

- [ ] **Add API to fetch learning path for context**
  - Example: `GET /api/paths?instrument=guitar&level=beginner&audience=kid`.

- [ ] **Render lessons list from `learning_paths` on frontend**
  - Use path units/lesson ordering to build the Lessons screen for the current instrument/level/audience.

## Meta

- Keep these three files (`CONTEXT.md`, `THE_PLAN.md`, `THE_STEPS.md`) up to date as we:
  - Add new templates.
  - Add new instruments/paths.
  - Adjust the migration/sync flow.
