import React, { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 → value with serif numerals.
 * Uses rAF for smooth easing. No external deps.
 */
export default function CountUp({
  value = 0,
  duration = 900,
  decimals = 0,
  suffix = '',
  prefix = '',
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    const target = Number(value) || 0;
    const from = fromRef.current;

    let raf;
    const tick = (t) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString('en-US');

  return (
    <span className="numeral" style={{ fontVariantNumeric: 'tabular-nums lining-nums' }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
