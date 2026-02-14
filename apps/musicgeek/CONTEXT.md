# MusicGeek Lessons – Context

## High-level

- **Product**: MusicGeek – multi-instrument music learning with lessons, practice sessions, tuner, metronome, and gamification.
- **Stack**:
  - Backend: Node/Express, MongoDB via Mongoose (`backend/`).
  - Frontend: React SPA (`frontend/`), single CSS file for app-wide styles.
- **Current lesson state (before this rework)**:
  - Lessons stored in Mongo `lessons` collection (`Lesson` model).
  - Embedded `steps` array with fields like `stepNumber`, `instruction`, `visualAssetUrl`, `type`, `media`, `interactiveContent`, `config`.
  - APIs expose lessons and steps via `lessonService` and `/api/lessons/*` routes.
  - Frontend pages:
    - `LessonDetailPage` – overview, metadata, optional video.
    - `PracticeSessionPage` – uses `LessonRunner` to walk `lesson.steps` sequentially.
- **User progress** is tracked separately in `user_progress` collection (`UserProgress` model) and wired into `lessonService`.

## New direction (in progress)

We are rearchitecting lessons around **templates + JSON content + learning paths**:

- **Lesson templates**:
  - Each lesson has a `template` key (e.g. `guided_steps_v1`, `video_quiz_v1`).
  - Templates define how a lesson is rendered (layout, progress UI, interaction model).
  - Frontend owns a `lessonTemplateRegistry` that maps `template` → React component.

- **JSON lesson content**:
  - Mongo `lessons` docs get a new `content` field (arbitrary JSON, validated by app/template layer).
  - Shape is template-specific. Example for `guided_steps_v1`:
    - `content.learningOutcomes: string[]`
    - `content.steps: [{ id, type, title, body, imageUrl, ... }]`.
  - We also standardize on a `slug` per lesson (e.g. `guitar-welcome`) for stable references from learning paths and JSON files.

- **Learning paths**:
  - New Mongo `learning_paths` collection.
  - Each document describes an ordered curriculum for a specific **instrument + level + audience**.
  - Example key fields:
    - `instrumentId` – references `Instrument`.
    - `level` – `beginner` | `intermediate` | `advanced`.
    - `audience` – `kid` | `adult` | `both`.
    - `trackType` – e.g. `core` vs `elective`.
    - `isDefault` – marks the default path for a given (instrument, level, audience).
    - `template` – path template, e.g. `linear_units_v1`.
    - `content.units[]` – ordered units, each with `lessons[]` referring to lessons by `lessonSlug`.
  - This answers questions like: "Which lessons are in `guitar • beginner • kid` and in what order?" without guessing from tags.

- **Source-of-truth content files (Option 1: snapshot sync)**:
  - Repo stores JSON definitions under:
    - `backend/content/lessons/*.json` – one file per lesson (includes `slug`, `template`, metadata, and `content`).
    - `backend/content/paths/*.json` – one file per learning path (`slug`, `instrumentSlug`, `level`, `audience`, units/lessons).
  - A `sync-content` script reads all JSON files and **upserts** into Mongo (by `slug`).
  - JSON in Git is the source of truth; script is safe to run repeatedly (idempotent by design, no migrations ledger).

## Constraints & assumptions

- **No active or historical users** for the new Mongo lessons system right now → we can safely:
  - Change lesson schemas and content formats.
  - Reset lesson documents and paths via snapshot sync.
- **Existing APIs and frontend pages must keep working** while we transition:
  - We will add new fields (`slug`, `template`, `content`) rather than removing existing `steps` immediately.
  - Legacy fields (e.g. `steps`, `videoUrl`) stay until the new template-based frontend is fully wired.
- **Mongo is the runtime source of truth**; JSON files define desired state and are applied via sync.
- **Docker / CI** may optionally run the snapshot sync script on build/start; script must be safe to run multiple times.

## Open questions (to revisit later)

- How much of user progress should be path-aware (e.g. "Unit 1 complete" vs "individual lessons complete")?
- How many path templates do we actually need beyond `linear_units_v1`?
- Should the frontend allow switching between multiple paths for the same instrument/level/audience (e.g. core vs elective tracks)?
