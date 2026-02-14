# NoteGeek
Notes, in MarkDown, as God intended.

## System Requirements

- Node.js: LTS version (v18.x or newer)
  - The app will not work correctly with Node.js v14 (system default)
  - Always use `nvm use --lts` before starting the client or server

## Development Setup

1. Ensure you have Node.js LTS installed:
   ```bash
   nvm install --lts
   nvm use --lts
   ```

2. Install dependencies:
   ```bash
   # In server directory
   cd server
   npm install

   # In client directory
   cd ../client
   npm install
   ```

3. Start the development servers:
   ```bash
   # Start server (in server directory)
   cd ../server
   nvm use --lts  # Important!
   npm run dev

   # Start client (in client directory)
   cd ../client
   nvm use --lts  # Important!
   npm run dev
   ```

## Troubleshooting

- If you see errors like `Unexpected token '||='`, you're using an outdated Node.js version
- Always run `nvm use --lts` before starting either the client or server
- The server requires port 5001 to be available
