# BookGeek — Unified System Specification

## Overview

BookGeek is a **self-hosted ebook library manager** designed to replace both CalibreWeb and Goodreads. It serves as the **authoritative source of truth** for:
- Book metadata
- User reading history
- Shelves and lists
- Reviews and ratings
- AI-powered recommendations

BookGeek manages its own database and UI, while delegating specialized tasks to external engines:
- **Calibre CLI** — headless content processor (format conversion, metadata extraction, normalization)
- **Gemini (via aiGeek)** — intelligent book recommendations

The system runs inside Docker and is fully self-contained.

---

## Core Architectural Principles

### 1. BookGeek Owns the Library Database
BookGeek maintains:
- Master list of all books
- Normalized metadata
- Reading history (start/finish dates, progress)
- Shelves and lists
- Ratings and reviews
- Ownership and file info
- Recommendation history

**Calibre is not allowed to modify the database.**

### 2. Calibre CLI is a Processing Engine, Not a Manager
Calibre CLI performs:
- Format conversion (mobi/azw3/pdf → epub)
- Metadata extraction from uploaded files
- Metadata fetching from online sources
- EPUB structure validation
- Cover extraction
- Series/author normalization

**Calibre never directly touches the DB.** BookGeek invokes CLI tools and consumes the output.

### 3. BookGeek Handles All CRUD and Storage
This includes:
- Adding/deleting books
- Editing metadata
- Matching duplicates
- Building series lists
- Tagging
- Search indexing
- File storage paths
- Device export endpoints

**Flow:** Calibre outputs → BookGeek interprets → DB updated.

---

## Book Ingestion Pipeline

### Step 1: User Uploads a Book File
BookGeek temporarily stores the raw file.

### Step 2: BookGeek Calls Calibre CLI Tools
- `ebook-meta` — extract metadata as JSON
- `fetch-ebook-metadata` — lookup missing fields
- `ebook-convert` — convert to preferred formats (EPUB)
- Other utilities for validation as needed

### Step 3: BookGeek Receives Processed Output
- Cleaned metadata
- Normalized title/author/series
- Extracted cover
- Cleaned/converted ebook file(s)

### Step 4: BookGeek Writes Metadata to DB
This data is authoritative; Calibre's output is raw material.

### Step 5: BookGeek Stores Files
Cleaned files go to local storage / NAS / S3.

### Step 6: BookGeek Updates Indices
Search indices and UI are refreshed.

---

## Replacing CalibreWeb

BookGeek provides all CalibreWeb functions:
- Full library browser
- Metadata editing
- Cover editing
- Shelves/tags
- Series management
- File upload/download
- Format conversion (via Calibre CLI)
- User-friendly UI for reading lists and collections

---

## Replacing Goodreads

BookGeek replaces Goodreads reading/social features:
- Ratings (1-5 stars)
- Reviews
- Reading progress
- Start/finish dates
- Book statistics
- Reading lists (to-read, reading, finished, abandoned)
- Reading challenge / yearly stats
- Quotes, notes, highlights (future)
- Friend/follow support (future)

---

## Recommendation Engine (Gemini via aiGeek)

### Seed-Based Recommendation Flow

1. User selects 1–3 seed books
2. BookGeek loads metadata for seed books
3. BookGeek loads:
   - All books user has read
   - All books user owns
4. BookGeek constructs AI prompt:
   - Seed book metadata
   - Reading history
   - Owned library
   - Instructions: avoid already-read/owned
   - Instructions: return 3–5 recommendations with reasoning
5. BookGeek sends prompt to aiGeek (Gemini backend)
6. Gemini returns recommendations with reasoning
7. BookGeek cross-references results:
   - Mark if already owned
   - Mark if already read
   - Mark "need-to-find" for unknown books
8. BookGeek saves recommendation session
9. UI displays categorized results

### Recommendation Classification

| Status | Meaning |
|--------|---------|
| `already-read` | User finished it |
| `owned-unread` | In library but not read |
| `need-to-find` | New to user |
| `series-continuation` | Part of a series user has begun |

### Recommendation Output Schema

```javascript
{
  title: String,
  authors: [String],
  reason: String,
  status: "already-read" | "owned-unread" | "need-to-find" | "series-continuation",
  matchedBookId: ObjectId | null
}
```

---

## Technical Architecture

### Stack
- **Runtime:** Bun (not Node)
- **Language:** JavaScript (not TypeScript)
- **Frontend:** React + Tailwind + shadcn/ui (Bun bundler)
- **Backend:** Bun + Express
- **Deployment:** Docker (ports 1800+)
- **UI:** Clean modern interface, Inter/Geist fonts, dark mode default

### External Integrations
- **aiGeek** — Gemini API for recommendations
- **baseGeek** — MongoDB, Redis, Auth (shared infrastructure)
- **Calibre CLI** — ebook processing (installed in container)
- **OpenLibrary / Google Books** — metadata lookup fallback

### Architecture Diagram
```
┌─────────────────────────────────────────────────┐
│              BookGeek Web UI                    │
│         React + Tailwind + shadcn/ui           │
│         Dark mode, modern fonts                │
└─────────────────────┬───────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────┐
│              Bun + Express API                  │
│  ┌─────────────────────────────────────────┐   │
│  │  Services                               │   │
│  │  - BookService (CRUD, search, storage)  │   │
│  │  - IngestionService (upload pipeline)   │   │
│  │  - CalibreService (CLI wrapper)         │   │
│  │  - ShelfService (lists, status)         │   │
│  │  - RecommendationService (aiGeek)       │   │
│  │  - LookupService (OpenLibrary/Google)   │   │
│  └─────────────────────────────────────────┘   │
└───────────┬─────────────────┬───────────────────┘
            │                 │
   ┌────────┴────────┐   ┌────┴────────────────┐
   ▼                 ▼   ▼                     ▼
┌──────────┐   ┌──────────────────────────────────┐
│ Calibre  │   │           baseGeek               │
│   CLI    │   │  MongoDB | Redis | Auth          │
└──────────┘   └──────────────────────────────────┘
                      │
                      ▼
               ┌─────────────┐
               │   aiGeek    │
               │   (Gemini)  │
               └─────────────┘
```

### Docker Ports
| Service | Port |
|---------|------|
| BookGeek API | 1800 |
| BookGeek Frontend | 1801 |
| (baseGeek/aiGeek on existing ports) |

### Database Schema (MongoDB)

```javascript
// books collection - authoritative library
{
  _id: ObjectId,

  // Core metadata
  title: String,
  authors: [String],
  series: { name: String, index: Number },
  isbn: String,
  isbn13: String,

  // External IDs (for deduplication & lookups)
  goodreadsId: String,
  openLibraryId: String,
  asin: String,
  googleBooksId: String,

  // Book details
  publisher: String,
  publishedDate: Date,
  pageCount: Number,
  description: String,
  language: String,
  tags: [String],

  // File storage (BookGeek owns this)
  files: [{
    format: String,         // 'epub', 'mobi', 'pdf', etc.
    path: String,           // relative path in storage
    size: Number,           // bytes
    addedAt: Date
  }],
  coverPath: String,        // relative path to cover image

  // Ownership & status
  owned: Boolean,           // true = file exists in library
  shelf: String,            // 'unread', 'reading', 'read', 'abandoned', 'want-to-read'

  // Reading data
  rating: Number,           // 1-5, null if unrated
  review: String,
  dateAdded: Date,
  dateStarted: Date,
  dateFinished: Date,
  readCount: Number,
  readingProgress: Number,  // 0-100 percentage

  // Metadata
  createdAt: Date,
  updatedAt: Date,
  source: String            // 'upload', 'goodreads-import', 'manual', 'lookup'
}

// recommendations collection
{
  _id: ObjectId,
  seedBooks: [ObjectId],
  recommendations: [{
    title: String,
    authors: [String],
    reason: String,
    status: String,         // 'already-read', 'owned-unread', 'need-to-find', 'series-continuation'
    matchedBookId: ObjectId
  }],
  createdAt: Date
}

// ingestion_jobs collection (track upload processing)
{
  _id: ObjectId,
  originalFilename: String,
  status: String,           // 'pending', 'processing', 'completed', 'failed'
  calibreOutput: Object,    // raw metadata from ebook-meta
  error: String,
  createdAt: Date,
  completedAt: Date
}
```

### API Endpoints

```
# Books
GET    /api/books              - List books (filters, pagination, search)
GET    /api/books/:id          - Get book details
POST   /api/books              - Add book manually (wishlist/metadata only)
PATCH  /api/books/:id          - Update book (rating, shelf, review, metadata)
DELETE /api/books/:id          - Delete book (removes files too if owned)

# Upload / Ingestion
POST   /api/upload             - Upload ebook file (triggers ingestion pipeline)
GET    /api/upload/:jobId      - Check ingestion job status

# Shelves
GET    /api/shelves            - List shelves with counts
GET    /api/shelves/:name      - Get books on shelf

# Search & Lookup
GET    /api/search?q=          - Search library
GET    /api/lookup?isbn=       - Lookup book externally (OpenLibrary/Google)
GET    /api/lookup?title=&author=

# Files
GET    /api/books/:id/download/:format  - Download book file
GET    /api/books/:id/cover             - Get cover image

# Import (one-time migrations)
POST   /api/import/goodreads   - Import Goodreads CSV
POST   /api/import/calibre     - Import existing Calibre library (one-time)

# Recommendations
POST   /api/recommendations    - Get AI recommendations (Gemini via aiGeek)
GET    /api/recommendations    - List past sessions
GET    /api/recommendations/:id

# Health
GET    /api/health             - Service health check
```

---

## Implementation Steps

### Step 1: Project Setup ✓
- [x] Initialize Bun project (JavaScript)
- [x] Set up Express server with Bun
- [x] Set up React frontend shell
- [x] Configure Docker (ports 1800, 1801)
- [x] Create .env for all paths and connection strings
- [ ] Install Calibre CLI in Docker container
- [ ] Connect to baseGeek MongoDB

### Step 2: Database & Models
- [ ] Define Mongoose schemas (books, recommendations, ingestion_jobs)
- [ ] Create database indexes (title, authors, isbn, goodreadsId, shelf)
- [ ] Set up file storage directory structure

### Step 3: Calibre CLI Integration
- [ ] Create CalibreService wrapper for CLI tools
- [ ] Implement ebook-meta extraction (JSON output)
- [ ] Implement fetch-ebook-metadata for lookups
- [ ] Implement ebook-convert for format conversion
- [ ] Implement cover extraction

### Step 4: Book Ingestion Pipeline
- [ ] File upload endpoint with temp storage
- [ ] Async job queue for processing
- [ ] Call Calibre CLI for metadata extraction
- [ ] Normalize and deduplicate
- [ ] Store files in permanent location
- [ ] Update database with book record

### Step 5: Goodreads Import (One-Time)
- [ ] Parse CSV with edge case handling
- [ ] Match to existing books by ISBN/title+author
- [ ] Import ratings, dates, shelves, reviews
- [ ] Create want-to-read entries for unowned books

### Step 6: Calibre Library Import (One-Time)
- [ ] Read existing Calibre metadata.db
- [ ] Copy book files to BookGeek storage
- [ ] Import all metadata to MongoDB
- [ ] This replaces CalibreWeb entirely

### Step 7: Core API
- [ ] Book CRUD endpoints
- [ ] Shelf management
- [ ] Search with filters
- [ ] Pagination
- [ ] File download endpoints

### Step 8: External Lookup
- [ ] OpenLibrary API integration
- [ ] Google Books API fallback
- [ ] Cover fetching & caching

### Step 9: Frontend - Library Browser
- [ ] Book grid/list views with covers
- [ ] Shelf sidebar/tabs
- [ ] Search bar
- [ ] Sort options
- [ ] Pagination

### Step 10: Frontend - Book Details
- [ ] Metadata display
- [ ] Cover image
- [ ] Rating component (1-5 stars)
- [ ] Shelf selector
- [ ] Review editor
- [ ] Download buttons by format

### Step 11: Frontend - Upload & Add
- [ ] Drag-and-drop file upload
- [ ] Upload progress indicator
- [ ] Manual add by ISBN/search
- [ ] Metadata editing form

### Step 12: AI Recommendations
- [ ] Gemini integration via aiGeek
- [ ] Prompt construction with library context
- [ ] Cross-reference results
- [ ] Save & display recommendation history

### Step 13: Polish
- [ ] Loading states & error handling
- [ ] Responsive design
- [ ] Dark mode (default)
- [ ] Keyboard shortcuts
- [ ] Toast notifications

---

## Data Migration Strategy

### Initial Setup (One-Time)
1. **Import Calibre Library** — copy all books + metadata from existing Calibre
2. **Import Goodreads Export** — merge reading history, ratings, reviews
3. **Reconcile** — match books, merge duplicates, fill gaps

### Matching Priority
1. **ISBN-13** (normalized)
2. **ISBN-10** (normalized)
3. **Goodreads ID**
4. **Title + Author** (fuzzy match, last resort)

### After Migration
- CalibreWeb is retired
- Calibre CLI remains for processing only
- BookGeek is the sole manager

---

## Environment Variables

```env
# Ports
API_PORT=1800
FRONTEND_PORT=1801

# baseGeek Services
BASEGEEK_MONGODB_URI=mongodb://basegeek:27017/bookgeek
BASEGEEK_REDIS_URI=redis://basegeek:6379
BASEGEEK_AUTH_URL=http://basegeek:port/auth

# aiGeek (Gemini)
AIGEEK_URL=http://aigeek:port/api
AIGEEK_API_KEY=

# Storage Paths
LIBRARY_PATH=/data/library          # where book files are stored
COVERS_PATH=/data/covers            # where cover images are stored
TEMP_PATH=/data/temp                # temp upload storage

# Calibre (for one-time import only)
CALIBRE_IMPORT_PATH=/Volumes/Media/Docker/calibreWeb/books

# External APIs
GOOGLE_BOOKS_API_KEY=optional

# Runtime
NODE_ENV=development
```

---

## Future Enhancements (Post-MVP)

- [ ] Integration with Readarr
- [ ] Reading statistics & visualizations
- [ ] Reading goals / challenges
- [ ] Book notes & highlights sync
- [ ] Series completion tracking
- [ ] Author pages
- [ ] Import from other sources (StoryGraph, LibraryThing)
- [ ] Export functionality (OPDS feed, CSV)
- [ ] Mobile-responsive PWA
- [ ] Browser extension for quick-add
- [ ] OPDS catalog for e-readers
- [ ] Send-to-Kindle / email delivery
- [ ] Multi-user support

### Library UX Improvements (Planned)

- [ ] Sorting controls in the main library view (at least author and title)
- [ ] Filtering by author, genre (tags), shelf (reading state), and owned status
- [ ] Shelf support across the stack: `unread`, `reading`, `read`, `want-to-read`, `abandoned`
- [ ] Ownership indicator pill on cards and in the book modal, plus an `owned` filter
- [ ] Infinite scroll / auto-pagination (books loaded in batches of 50 as the user scrolls)
- [ ] Sidebar shelf counts that reflect current filters and total items
- [ ] Send-to-Kindle integration using a per-user Kindle email stored in a profile document
- [ ] Recommendations card in the sidebar replacing "Next up" (initially: random unread pick with cover + "Find Books" button stub)

---

## Success Criteria

### MVP Complete When:
1. ✅ Can upload ebooks and have metadata extracted automatically
2. ✅ Can browse library with covers, search, and filters
3. ✅ Can manage shelves (reading, read, want-to-read, etc.)
4. ✅ Can rate and review books
5. ✅ Can download books in available formats
6. ✅ Goodreads history imported (ratings, shelves, dates)
7. ✅ Existing Calibre library imported
8. ✅ Can get AI recommendations via Gemini
9. ✅ Recommendations show ownership/read status
