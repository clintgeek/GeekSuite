// The suite's `useRefetchOnResume` (packages/ui/src/hooks/useRefetchOnResume.js),
// imported by file path: @geeksuite/ui exports only its root index, which
// pulls MUI, emotion and react-router — none of which this Tailwind app uses.
// The hook itself imports nothing but React; vite.config.js dedupes React so
// it shares this app's copy. If packages/ui ever adds a subpath export for
// its hooks, import from there instead.
export { useRefetchOnResume } from '../../../../packages/ui/src/hooks/useRefetchOnResume.js'
