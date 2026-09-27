// Test stand-in for vite-plugin-pwa's virtual module (only exists when the
// PWA plugin runs; vitest doesn't load it). Tests vi.mock it as needed.
export const registerSW = () => () => {};
