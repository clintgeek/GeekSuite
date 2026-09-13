# NoteGeek Build Plan for AI Assistant (Sage)

## 0. Project Goal & Overview
*   **Objective**: Build NoteGeek - a lightweight, markdown-based PWA note-taking app as part of the GeekSuite collection.
*   **Target User**: Developers & Geeks.
*   **Core Features**: Markdown editor/viewer, folder/tag organization, note locking, note encryption, search, PWA support, Dockerized deployment, Backup system (local/Nextcloud).
*   **GeekSuite Integration**:
    *   Part of a larger suite of custom applications
    *   Shares consistent tech stack and design patterns with other GeekSuite apps
    *   References FitnessGeek for UI/UX patterns
*   **Tech Stack**:
    *   Frontend: React (PWA only, no React Native), **Material-UI (MUI)**, SASS
    *   Backend: Node.js, Express
    *   Database: MongoDB
    *   Containerization: Docker, Docker Compose

## 1. Environment & Project Setup
1.1.  **Prerequisites**: Confirm Docker, Docker Compose, **Node.js 20.x (LTS)**, and npm are installed and accessible in the terminal.
1.2.  **Directory Structure**: Create base project folders.
    *   Confirmed structure: `client/` (Frontend), `server/` (Backend), `docker/`, `data/db`, `data/backups`.
1.3.  **Version Control**:
    *   Initialize Git repository: `git init`.
    *   Create `.gitignore`: Add `node_modules/`, `client/dist/`, `client/build/`, `.env*`, `.env.local`, `CURSOR-CONTEXT.md`, `data/`, `*.log`. **Important**: Ensure no sensitive files (`.env*`, `CURSOR-CONTEXT.md`) are committed.
1.4.  **Docker Configuration (`docker-compose.yml`)**:
    *   Create `docker-compose.yml`.
    *   Define initial services: `mongo`, `backup`.
    *   Configure `mongo` service:
        *   Image: `mongo:latest` (Confirmed)
        *   Container Name: `notegeek-mongo`
        *   Ports: `27017:27017`
        *   Volumes: `./data/db:/data/db`, `./data/backups:/data/backups`
        *   Network: `notegeek_network`
        *   Restart Policy: `always`
    *   Configure `backup` service (based on existing docs).
    *   Define `notegeek_network` (bridge driver).
1.5.  **Environment Variables**:
    *   Create `server/.env.template` with needed variables: `DB_URI`, `PORT`, `SECRET_KEY`, `JWT_SECRET`.
    *   *Process*: Maintain `server/.env.template` by adding new required variables as they are identified.
    *   *Chef: Any other initial variables needed beyond PORT?*
    *   **Local Development**: Instruct Chef to create `server/.env.local` locally for development settings. The `DB_URI` should use the credentials from `CURSOR-CONTEXT.md` and the server IP (e.g., `DB_URI=mongodb://<DB_USERNAME>:<DB_PASSWORD>@192.168.1.17:27017/notegeek_dev`). Use `dotenv` to load `.env.local`. This file **must not** be committed (covered by `.gitignore`).
    *   **Production**: On the deployment server, a standard `server/.env` file will be created manually with production credentials (likely matching dev for this project) and production `DB_URI`. This file **must not** be committed.

## 2. Backend Development (Node.js/Express in `server/`)
2.1.  **Initialize Project**:
    *   `cd server`
    *   `npm init -y`
    *   Install dependencies: `npm install express mongoose dotenv cors bcrypt jsonwebtoken`
    *   Install dev dependencies: `npm install -D nodemon morgan` (Using `nodemon` for dev server confirmed).
    *   Add `start` and `dev` scripts to `package.json` (e.g., `dev`: `nodemon server.js`).
2.2.  **Server Setup**:
    *   Create main server file (`server.js` or `app.js`).
    *   Implement basic Express app structure.
    *   Setup middleware: `cors()`, `express.json()`, `express.urlencoded({ extended: false })`.
    *   Use `morgan('dev')` for HTTP request logging in development environment.
    *   Plan for **global error handling middleware**.
    *   Plan for **input validation using `express-validator`**.
    *   Plan for **rate limiting** on sensitive endpoints (e.g., `express-rate-limit`).
    *   *Chef: Use `morgan` for HTTP request logging?*
2.3.  **Database Connection**:
    *   Create `config/db.js`. Implement Mongoose connection logic using `DB_URI` from `.env`. Call connect function in `server.js`.
2.4.  **Define Mongoose Models**:
    *   `models/User.js`: `email` (unique, required), `passwordHash` (required), `createdAt`.
    *   `models/Note.js`: `title`, `content` (required), `userId` (ref: 'User', required, index), `folderId` (ref: 'Folder', index), `tags` ([String], index), `isLocked` (Boolean, default: false), `isEncrypted` (Boolean, default: false), `lockHash` (String, optional), `createdAt`, `updatedAt`. (Confirmed: `lockHash`). Add indexes for `createdAt`, `updatedAt`.
    *   `models/Folder.js`: `name` (required), `userId` (ref: 'User', required, index), `createdAt`. Add index for `createdAt`.
    *   *Chef: Reviewing `Note` model fields - specifically `isLocked`, `isEncrypted`, `lockHash`. See Section 2.9.*
2.5.  **Authentication (`routes/auth.js`, `controllers/auth.js`)**:
    *   Register (`POST /api/auth/register`): Standard user registration (no special first user script).
    *   Login (`POST /api/auth/login`): Validate input, find user, compare password hash, return JWT.
    *   Auth Middleware (`middleware/auth.js`): Verify JWT from `Authorization` header, attach user to request.
2.6.  **Notes API (`routes/notes.js`, `controllers/notes.js`)**: (Protect routes with auth middleware)
    *   Create (`POST /api/notes`): Handle input, encryption/locking.
    *   Read All (`GET /api/notes`): Filter by `userId`. Add query params for folder/tag/search filtering.
    *   Read One (`GET /api/notes/:id`): Check ownership. Handle decryption/unlocking.
    *   Update (`PUT /api/notes/:id`): Check ownership. Handle updates to content, lock/encryption status.
    *   Delete (`DELETE /api/notes/:id`): Check ownership.
2.7.  **Folders API (`routes/folders.js`, `controllers/folders.js`)**: (Protect routes)
    *   Create (`POST /api/folders`).
    *   Read All (`GET /api/folders`): Filter by `userId`.
    *   Update (`PUT /api/folders/:id`): Check ownership.
    *   Delete (`DELETE /api/folders/:id`): Check ownership. Implement logic to **prompt user** on frontend whether to cascade-delete notes or unassign `folderId`.
2.8.  **Tags**:
    *   Manage tags directly via Notes API (add/remove from `tags` array).
    *   Implement endpoint to get all unique tags for user (`GET /api/tags`). (Protect route)
2.9.  **Search (`routes/search.js`, `controllers/search.js`)**:
    *   Implement (`GET /api/search?q=query`): Use MongoDB text index on `Note` model (`title`, `content`) for efficient search within user's notes. (Protect route)
2.10. **Note Locking/Encryption Logic**:
    *   **Encryption**: Encrypt `Note.content` field before saving, decrypt after fetching. Use Node.js `crypto` module (AES-256-GCM recommended). Use global `SECRET_KEY` from `.env` for encryption key. Store `isEncrypted = true` flag.
    *   **Locking**: Prompt user for password on frontend to view/edit locked notes. Store a separate `lockHash` (bcrypt hash of note-specific password) on the `Note` model. Verify against this hash. Store `isLocked = true` flag.

## 3. Frontend Development (React/SASS in `client/`)
3.1.  **Initialize Project**:
    *   `cd client`
    *   Create React app: `npm create vite@latest . -- --template react` (Using Vite)
    *   Install dependencies: `npm install react-router-dom axios sass react-markdown @mui/material @mui/icons-material @emotion/react @emotion/styled zustand`
    *   Install dev dependencies: `npm install -D @vitejs/plugin-react` (for Vite + React)
    *   *State Management*: Using Zustand for state management (confirmed)
3.2.  **Project Structure**:
    *   Organize into `components/`, `pages/`, `contexts/`, `hooks/`, `services/`, `styles/`.
    *   Setup SASS: `styles/main.scss` importing partials (base, components, layout).
3.3.  **Core Components**:
    *   `Layout`: Sidebar + Main Content structure.
    *   `Sidebar`: Links for Folders, Tags, All Notes, Search.
    *   `NoteList`: Displays list of notes (titles/snippets). Filterable.
    *   `NoteEditor`: Text area for Markdown input. Use `react-markdown` preview or library like `react-mde`.
    *   `NoteViewer`: Renders note `content` using `react-markdown`. Handle locked state (password prompt).
    *   `AuthForm`: Combined Login/Register form.
    *   `ProtectedRoute`: Wrapper for routes requiring authentication.
3.4.  **Routing (`App.jsx`)**:
    *   Use `react-router-dom`.
    *   Public: `/login`, `/register`.
    *   Private: `/` (main view), `/notes/:id`, `/folders/:folderId`, `/tags/:tagName`, `/search`.
3.5.  **API Service (`services/api.js`)**:
    *   Setup `axios` instance.
    *   Functions for auth, notes, folders, tags API calls.
    *   Handle JWT: Store token (localStorage), add `Authorization` header to requests. Interceptor for handling 401 errors (logout).
3.6.  **State Management (`contexts/`, `store/`)**:
    *   Use **Zustand** for primary application state (notes, folders, tags, loading/error states, search results). Create stores (e.g., `store/noteStore.js`, `store/uiStore.js`).
    *   Use React Context API for simple, relatively static state if needed (e.g., `AuthContext` for user object/token, potentially Mantine theme context).
3.7.  **Implement Features**:
    *   Connect components to contexts/API services.
    *   Build out UI for viewing notes (Markdown rendering).
    *   Build out UI for editing notes (Markdown editor).
    *   Implement folder/tag navigation and filtering.
    *   Implement search UI and functionality.
    *   Implement locking/encryption UI (password prompts, visual indicators).
3.8.  **Styling (`styles/`)**:
    *   Utilize **Material-UI (MUI)** components for core UI elements (layout, forms, buttons, modals, etc.).
    *   Configure MUI theme (colors, typography, etc.).
    *   Use SASS for custom component styles, overrides, or global styles where needed.
3.9.  **PWA Setup**:
    *   Configure `vite-plugin-pwa` (if using Vite) or manually setup service worker and `manifest.json`.
    *   Test offline capabilities.

## 4. Docker Integration & Deployment
4.1.  **Backend Dockerfile (`server/Dockerfile`)**:
    *   Use `node:20-alpine` (LTS) base image.
    *   Set working dir, copy `package.json`/`package-lock.json`, run `npm ci --only=production`.
    *   Copy source code.
    *   Expose `PORT`. Define `CMD ["node", "server.js"]`.
4.2.  **Frontend Dockerfile (`client/Dockerfile`)**:
    *   Multi-stage build.
    *   Stage 1 (Build): Use `node:20-alpine` (LTS) base image, copy `package.json`, `npm install`, copy source, `npm run build`.
    *   Stage 2 (Serve): `nginx:alpine` base image (Confirmed).
        *   Copy build output from Stage 1 to Nginx HTML directory (`/usr/share/nginx/html`).
        *   Copy custom Nginx config (`docker/nginx/nginx.conf`) to handle SPA routing (try_files) and proxy `/api` requests to backend service.
4.3.  **Update `docker-compose.yml`**:
    *   Add `backend` service: `build: ./server`, ports (`${PORT}:${PORT}`), depends_on `mongo`, network, environment variables from `.env`.
    *   Add `frontend` service: `build: ./client`, ports (`80:80` or `3000:80`), depends_on `backend`, network.
4.4.  **Backup System**:
    *   Finalize `backup` service in `docker-compose.yml`.
    *   Create `backup.sh` script in project root (or `docker/`). Include **logic to cleanup old backups** (e.g., older than X days).
    *   Guide Chef on setting up host cron job to run `docker compose run --rm backup`.
4.5.  **Deployment**:
    *   **Target Server**: Ubuntu server running Docker. Has existing reverse proxy handling SSL.
    *   **Development OS**: macOS 15.2 (M3 Max).
    *   **Production Domain**: `notegeek.clintgeek.com` (via existing reverse proxy).
    *   **Steps**: Configure production `server/.env` on server, clone repo, run `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` (Example using override file for prod).
    *   **Reverse Proxy Integration**: Configure frontend Nginx container to expose its internal port 80 on host port **`9988`** (e.g., `-p 9988:80`). Chef will configure the existing external Nginx proxy to connect to this host port `9988`.
4.6.  **Nextcloud Backup Integration**:
    *   Modify `backup.sh` to move `*.tar.gz` files to Chef's Nextcloud sync path.

## 5. Testing & Refinement
5.1.  **Testing Approach**: Implement Test-Driven Development (TDD). Start with backend unit/integration tests (e.g., using Jest/Supertest) focusing on auth and core CRUD operations. Add frontend tests later (e.g., Vitest/React Testing Library).
5.2.  **Manual Testing**: Thoroughly test all features, PWA offline mode, responsiveness (desktop/mobile).
5.3.  **Debugging**: Address issues found during testing.

## 8. Future Features / Improvements (V2+)
*   Password Reset Flow
*   Mind Mapping Feature:
    *   Integration with react-flow for visualization
    *   Support for markdown in nodes
    *   Multiple layout options (tree, force-directed)
    *   JSON-based data structure for mind map storage
    *   Bidirectional conversion between text and mind map views
    *   Export/import functionality
*   GeekSuite Integration Features:
    *   Shared authentication system across GeekSuite apps
    *   Unified dashboard for all GeekSuite apps
    *   Cross-app data linking (e.g., linking notes to fitness logs)
    *   Consistent theme and UI patterns across suite

## Implementation Progress
*   **Completed**:
    *   Basic note CRUD operations
    *   Tag system with snake_case formatting
    *   Note editing with save/delete functionality
    *   Basic layout and navigation
*   **In Progress**:
    *   Core feature implementation
    *   UI alignment with FitnessGeek
*   **Next Steps**:
    *   Complete remaining core features
    *   Implement mind mapping
    *   Set up backup system

## Summary of Decisions Made (All major planning points addressed)

*   **Initial `.env`**: Start with `PORT`, `DB_URI`, `SECRET_KEY`, `JWT_SECRET`; add others as needed.
*   **Backend Logging**: Use `morgan` for HTTP request logging in dev.
*   **Dev Server**: Use `nodemon` for backend dev.
*   **Folder Deletion**: Prompt user on frontend to choose between cascade-delete notes or unassigning `folderId`.
*   **State Management**: Use `Zustand` primarily, potentially with Context API for simple static state.
*   **Frontend Styling**: Use `Material-UI (MUI)` component library, supplement with SASS.
*   **GeekSuite Standard**: All GeekSuite apps will use Material-UI for consistent look and feel.
*   **Tag Format**: Using snake_case for tag formatting
*   **UI Reference**: Using FitnessGeek as reference for styling and UX patterns

Ready to start building!