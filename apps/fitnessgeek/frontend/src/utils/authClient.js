// Local dev helper — kept here because it's specific to fitnessgeek's dev proxy port.
// All auth functions (getMe, loginRedirect, logout, etc.) now come from @geeksuite/auth.

export function getBackendOrigin() {
  if (!import.meta.env.DEV) return '';
  const hostname = window.location.hostname;
  const fitnessGeekPort = 3001;
  return `http://${hostname}:${fitnessGeekPort}`;
}
