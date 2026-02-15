// Thin wrapper around @geeksuite/user reset to avoid hook usage in non-React code.
// The store's reset() is a plain function, not a hook, so we can import it directly
// from the module internals. We re-export it here for clarity and to keep authStore
// decoupled from the @geeksuite/user package structure.

let _reset = null;

export function registerReset(fn) {
  _reset = fn;
}

export function reset() {
  if (_reset) _reset();
}
