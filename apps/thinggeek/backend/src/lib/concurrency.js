/**
 * A tiny single-flight guard: `run()` refuses to start a second copy of `fn`
 * while one is still in flight (the daily purge must never overlap itself if
 * a run takes longer than the interval, or the boot run collides with the
 * first tick).
 */
export function singleFlight(fn) {
  let running = null;
  return async (...args) => {
    if (running) return { skipped: true };
    running = (async () => fn(...args))();
    try {
      return await running;
    } finally {
      running = null;
    }
  };
}

export default { singleFlight };
