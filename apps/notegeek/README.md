# NoteGeek
Notes, in MarkDown, as God intended.

## System Requirements

- Node.js: LTS version (v18.x or newer)
  - The app will not work correctly with Node.js v14 (system default)
  - Always use `nvm use --lts` before starting the frontend or backend

## Development Setup

1. Ensure you have Node.js LTS installed:
   ```bash
   nvm install --lts
   nvm use --lts
   ```

2. Install dependencies:
   ```bash
   # In backend directory
   cd backend
   npm install

   # In frontend directory
   cd ../frontend
   npm install
   ```

3. Start the development servers:
   ```bash
   # Start backend (in backend directory)
   cd ../backend
   nvm use --lts  # Important!
   npm run dev

   # Start frontend (in frontend directory)
   cd ../frontend
   nvm use --lts  # Important!
   npm run dev
   ```

## Troubleshooting

- If you see errors like `Unexpected token '||='`, you're using an outdated Node.js version
- Always run `nvm use --lts` before starting either the frontend or backend
- The unified app container defaults to port 9988 (override with `PORT`)
