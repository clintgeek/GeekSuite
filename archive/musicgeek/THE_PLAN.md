# MusicGeek Lessons – Plan

## Goals

- **Consistency**: All lessons of the same type share layout, behavior, and UX (Duolingo-style sessions, etc.).
- **Decoupling**: Content lives in JSON (per lesson/path); templates live in React and can evolve independently.
- **Path-aware UX**: Users select `instrument • level • audience` and see a curated sequence of lessons.
- **Simple content workflow**: Updating or adding lessons/paths is a Git change + a single snapshot sync script.

## Phases

### Phase 1 – Backend foundations & content sync (current)

- Extend `Lesson` model with:
  - `slug` (unique, human-readable ID, used in JSON and paths).
  - `template` (e.g. `guided_steps_v1`).
  - `content` (JSON, `Schema.Types.Mixed`).
- Add `LearningPath` model with:
  - `slug`, `instrumentId`, `level`, `audience`, `trackType`, `isDefault`.
  - `template` (e.g. `linear_units_v1`).
  - `content.units[]` with `lessons[]` referencing `lessonSlug`.
- Introduce JSON sources of truth:
  - `backend/content/lessons/*.json` – lesson definitions.
  - `backend/content/paths/*.json` – path definitions.
- Implement `sync-content` script:
  - Connects to Mongo.
  - Reads all JSON lessons/paths.
  - Upserts documents into `lessons` and `learning_paths` by `slug`.
- Add npm script (e.g. `npm run content:sync`) and document usage.

### Phase 2 – Lesson template rendering (frontend)

- Add `lessonTemplateRegistry` and `LessonTemplateRenderer`:
  - Maps `lesson.template` → React component.
  - Accepts `lesson` object (meta + content) from API.
- Implement first template `guided_steps_v1`:
  - Duolingo-style guided session layout for step-based lessons.
  - Uses existing Practice Session flow (`PracticeSessionPage`) but driven by `lesson.content.steps` instead of legacy `lesson.steps`.
  - Reuses/extends `LessonRunner` or replaces it with a template-specific runner.
- Gradually migrate `LessonDetailPage` and `PracticeSessionPage` to use `LessonTemplateRenderer`.
- Keep legacy fields in the API until all lesson pages use templates.

### Phase 3 – Path-based lesson selection

- Add backend endpoint(s) to resolve the appropriate `learning_path` for a user context, e.g.:
  - `GET /api/paths?instrument=guitar&level=beginner&audience=kid`.
- On the frontend:
  - When instrument/level/audience are chosen, fetch the active path.
  - Render units and lessons via a `PathTemplateRenderer` (e.g. `linear_units_v1`).
  - Use path ordering and requirements to control which lessons are shown/unlocked.
- Integrate path awareness into progress summaries where useful (e.g. unit completion, path progress bar).

### Phase 4 – Advanced lesson + step templates

- Add richer step types and corresponding templates:
  - Multiple-choice quiz steps.
  - Tap-to-highlight / interactive diagram steps.
  - Checkpoints/summary steps.
- Extend JSON schema for those templates (still under `lesson.content`).
- Incrementally enhance `guided_steps_v1` or introduce new templates as needed.

### Phase 5 – Tooling & authoring (future)

- Optional: simple internal tooling to validate JSON content against template-specific schemas.
- Optional: admin/editor UI for lesson and path content that reads/writes the JSON source files.

## Out of scope (for now)

- Reworking core auth, XP, or achievement logic.
- Real-time collaboration or in-browser content editing UIs.
- Multi-tenant or per-organization curricula.
