# FlockGeek Frontend

React + Vite frontend for FlockGeek. It includes navigation, layout primitives, theming, and an auth-aware header to get a flock-management UI up quickly.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Structure

- `src/theme/` — centralized color palette, typography, and color mode controls
- `src/components/` — layout shell, navigation bar, footer, and hero UI elements
- `src/pages/` — starter Home and Dashboard screens showcasing spacing + cards
- `src/contexts/AuthContext.jsx` — basic auth provider wired to the Express API
- `src/services/apiClient.js` — Axios instance with base URL + error handling

## PWA Support

The app registers `public/sw.js` at runtime and ships a `manifest.json` for the PWA. Update the icons and metadata to match your product.

## Extending

- Add additional routes under `src/pages/` and wire them into `App.jsx`
- Drop in domain-specific widgets (egg charts, bird lists) inside `DashboardPage.jsx`
- Replace the mock login fallback with your production auth flow when ready
