import { useEffect, useState } from 'react';

/** `value`, but only after it has held still for `delay` ms. */
export function useDebouncedValue(value, delay = 150) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return undefined;
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, settled, delay]);
  return settled;
}
