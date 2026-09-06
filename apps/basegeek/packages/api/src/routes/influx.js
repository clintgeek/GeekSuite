import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getInfluxConfig, getInfluxQueryApi, pingInflux } from '../config/influx.js';
import logger from '../lib/logger.js';

const router = express.Router();

// Admin only — the whole router. `/status` returns the Influx url/org/bucket
// config and queries the bucket's measurement names and point counts — the
// same infrastructure inventory as routes/mongo.js, which carries the full
// note. See DOCS/AUTH_SYSTEM.md (Roles).
router.use(requireAdmin);

/**
 * Q62 asked for a `user_id` tag filter on InfluxDB reads. It does not apply
 * here, and the reason is worth writing down so the next reader does not go
 * looking for the filter and conclude it was forgotten.
 *
 * 1. **This router reads nothing user-scoped.** `/status` is the only route.
 *    It answers three questions — is Influx reachable, how many measurements
 *    does the bucket hold, how many points landed in the last hour — for the
 *    DataGeekPage infrastructure panel. Those are bucket-wide counts by
 *    definition; scoping them to the admin who asked would report the bucket
 *    as nearly empty and make the panel lie about the thing it exists to
 *    watch. It is admin-gated for exactly that reason (`requireAdmin` above),
 *    the same treatment routes/mongo.js, redis.js and postgres.js get.
 *
 * 2. **The user-scoped reads are fitnessgeek's, in another tree and against
 *    another database.** basegeek talks Influx v2 to bucket
 *    `INFLUXDB_BUCKET` (default `datageek_metrics`);
 *    `apps/fitnessgeek/backend/src/services/influxService.js` talks Influx v1
 *    to database `INFLUXDB_DATABASE` (default `geekdata`). Different API,
 *    different data. R122 owns that file.
 *
 * 3. **Nothing in this monorepo writes to Influx at all.** There is no
 *    `writePoints`/`getWriteApi` call anywhere in `apps/` or `packages/`; the
 *    Garmin sync that fills `geekdata` runs outside the repo. So the write
 *    side cannot be read to find out whether points carry a user tag, and the
 *    nine measurements fitnessgeek reads — SleepIntraday, SleepSummary,
 *    HeartRateIntraday, StressIntraday, BodyBatteryIntraday, StepsIntraday,
 *    DailyStats, HRV_Intraday, BreathingRateIntraday — are queried with a time
 *    range and nothing else. A filter added blind would return zero rows and
 *    blank the fitnessgeek dashboard.
 *
 * TODO (needs the live bucket, so it is Chef's, not an agent's): run
 * `import "influxdata/influxdb/schema" schema.tagKeys(bucket: "geekdata")`
 * against the running Influx and record which of the nine measurements carry a
 * user tag. If they all do, fitnessgeek's reads get the filter. If none do —
 * which is the likely answer for a single-household Garmin feed — the honest
 * fix is to say so in fitnessgeek's context file and leave the reads alone,
 * because a per-user filter over single-user data is theatre with an outage
 * attached.
 */

const buildBaseStatus = () => ({
  status: 'disconnected',
  config: getInfluxConfig(),
  measurements: {
    count: 0,
    samples: []
  },
  stats: {
    pointsLastHour: null,
    lastPointTime: null
  }
});

router.get('/status', async (req, res) => {
  const statusPayload = buildBaseStatus();
  try {
    const reachable = await pingInflux();
    statusPayload.status = reachable ? 'connected' : 'unreachable';

    if (!reachable) {
      return res.json(statusPayload);
    }

    const queryApi = getInfluxQueryApi();
    const { bucket } = statusPayload.config;

    try {
      const measurementQuery = `import "influxdata/influxdb/schema"
        schema.measurements(bucket: "${bucket}")`;
      const measurementRows = await queryApi.collectRows(measurementQuery);
      const measurements = (measurementRows || [])
        .map(row => row?._value)
        .filter(Boolean);
      statusPayload.measurements.count = measurements.length;
      statusPayload.measurements.samples = measurements.slice(0, 5);
    } catch (error) {
      req.log.error({ err: error }, 'Influx measurements query failed');
      statusPayload.measurements.error = error.message;
    }

    try {
      const pointCountFlux = `from(bucket: "${bucket}")
        |> range(start: -1h)
        |> count()`;
      const pointRows = await queryApi.collectRows(pointCountFlux);
      const pointsLastHour = (pointRows || []).reduce((sum, row) => sum + (Number(row?._value) || 0), 0);
      statusPayload.stats.pointsLastHour = pointsLastHour;
    } catch (error) {
      req.log.error({ err: error }, 'Influx point count query failed');
      statusPayload.stats.pointsLastHour = null;
    }

    try {
      const lastPointFlux = `from(bucket: "${bucket}")
        |> range(start: -24h)
        |> keep(columns: ["_time"])
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)`;
      const lastPointRows = await queryApi.collectRows(lastPointFlux);
      statusPayload.stats.lastPointTime = lastPointRows?.[0]?._time || null;
    } catch (error) {
      req.log.error({ err: error }, 'Influx last point query failed');
    }

    return res.json(statusPayload);
  } catch (error) {
    req.log.error({ err: error }, 'Influx status endpoint error');
    return res.status(500).json({
      status: 'error',
      message: error.message,
      config: statusPayload.config
    });
  }
});

export default router;
