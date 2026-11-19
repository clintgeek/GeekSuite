const PG_UNIT = { days: 'd', hours: 'h', minutes: 'm' };

/**
 * Postgres hands back an interval object ({ days, hours, minutes, seconds,
 * milliseconds }); write it the way Mongo and Redis are written, "12d 4h 33m",
 * rather than "12 days 4 hours 33 minutes 7 seconds".
 */
export function formatPostgresUptime(uptime) {
  if (!uptime) return '';
  if (typeof uptime === 'string') return uptime;
  if (typeof uptime === 'object') {
    const parts = ['days', 'hours', 'minutes']
      .filter((k) => Number.isFinite(Number(uptime[k])))
      .map((k) => `${Number(uptime[k])}${PG_UNIT[k]}`);
    return parts.length ? parts.join(' ') : '0m';
  }
  return String(uptime);
}
