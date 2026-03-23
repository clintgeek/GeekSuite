let _reset = null;

export function registerReset(fn) {
  _reset = fn;
}

export function reset() {
  if (_reset) _reset();
}
