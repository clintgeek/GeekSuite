import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getInfluxConfig, getInfluxQueryApi, pingInflux } from '../config/influx.js';

const router = express.Router();

router.use(authenticateToken);

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
      console.error('Influx measurements query failed:', error.message);
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
      console.error('Influx point count query failed:', error.message);
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
      console.error('Influx last point query failed:', error.message);
    }

    return res.json(statusPayload);
  } catch (error) {
    console.error('Influx status endpoint error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      config: statusPayload.config
    });
  }
});

export default router;
