import { InfluxDB } from '@influxdata/influxdb-client';
import axios from 'axios';
import logger from '../lib/logger.js';

const {
  INFLUXDB_URL = 'http://localhost:8086',
  INFLUXDB_TOKEN = '',
  INFLUXDB_ORG = 'basegeek',
  INFLUXDB_BUCKET = 'datageek_metrics'
} = process.env;

let influxInstance;

const getInfluxInstance = () => {
  if (!influxInstance) {
    if (!INFLUXDB_TOKEN) {
      logger.warn('⚠️  INFLUXDB_TOKEN not set. Influx queries will likely fail.');
    }
    influxInstance = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
  }
  return influxInstance;
};

export const getInfluxQueryApi = () => getInfluxInstance().getQueryApi(INFLUXDB_ORG);

export const pingInflux = async (timeout = 5000) => {
  try {
    const response = await axios.get(`${INFLUXDB_URL}/health`, { timeout });
    return response.data.status === 'pass';
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    logger.error({ err: error }, 'InfluxDB health check failed');
    throw new Error(message);
  }
};

export const getInfluxConfig = () => ({
  url: INFLUXDB_URL,
  org: INFLUXDB_ORG,
  bucket: INFLUXDB_BUCKET
});
