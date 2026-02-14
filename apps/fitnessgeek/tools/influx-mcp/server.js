#!/usr/bin/env node
import dotenv from 'dotenv';
import { InfluxDB } from 'influx';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

dotenv.config();

const config = {
  protocol: process.env.INFLUXDB_PROTOCOL || 'http',
  host: process.env.INFLUXDB_HOST || 'localhost',
  port: Number(process.env.INFLUXDB_PORT || 8086),
  username: process.env.INFLUXDB_USERNAME,
  password: process.env.INFLUXDB_PASSWORD,
  database: process.env.INFLUXDB_DATABASE,
};

if (!config.database) {
  console.error('INFLUXDB_DATABASE is required for the Influx MCP server.');
  process.exit(1);
}

const influx = new InfluxDB({
  host: config.host,
  port: config.port,
  protocol: config.protocol,
  username: config.username,
  password: config.password,
  database: config.database,
  options: {
    rejectUnauthorized: false,
  },
});

const formatJSON = data => JSON.stringify(data, null, 2);

const server = new McpServer({
  name: 'influx-mcp',
  version: '0.1.0',
});

// Tool: ping
server.tool(
  'influx_ping',
  'Verify connectivity with the configured InfluxDB instance.',
  async () => {
    const results = await influx.ping(5000);
    const data = results.map(r => ({
      url: `${config.protocol}://${config.host}:${config.port}`,
      online: r.online,
      rtt: r.rtt,
    }));
    return { content: [{ type: 'text', text: formatJSON(data) }] };
  }
);

// Tool: listMeasurements
server.tool(
  'influx_listMeasurements',
  'List all measurements inside the configured database.',
  async () => {
    const measurements = await influx.getMeasurements();
    return { content: [{ type: 'text', text: formatJSON(measurements) }] };
  }
);

// Tool: describeMeasurement
server.tool(
  'influx_describeMeasurement',
  'Return field/tag keys for a measurement.',
  { measurement: { type: 'string', description: 'The measurement name' } },
  async ({ measurement }) => {
    const [fields, tags] = await Promise.all([
      influx.query(`SHOW FIELD KEYS FROM "${measurement}"`),
      influx.query(`SHOW TAG KEYS FROM "${measurement}"`),
    ]);
    const data = {
      measurement,
      fields: fields.map(row => ({ fieldKey: row.fieldKey, fieldType: row.fieldType })),
      tags: tags.map(row => row.tagKey),
    };
    return { content: [{ type: 'text', text: formatJSON(data) }] };
  }
);

// Tool: listDatabases
server.tool(
  'influx_listDatabases',
  'List all databases on the InfluxDB instance.',
  async () => {
    const dbs = await influx.getDatabaseNames();
    return { content: [{ type: 'text', text: formatJSON(dbs) }] };
  }
);

// Tool: query
server.tool(
  'influx_query',
  'Execute an InfluxQL query against the configured database.',
  {
    query: { type: 'string', description: 'The InfluxQL query to execute' },
    chunkSize: { type: 'number', description: 'Optional chunk size for large results' },
  },
  async ({ query, chunkSize }) => {
    const options = {};
    if (chunkSize) {
      options.chunkSize = chunkSize;
    }
    const rows = await influx.query(query, options);
    return { content: [{ type: 'text', text: formatJSON(rows) }] };
  }
);

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Influx MCP server started.');
}

start().catch(err => {
  console.error('Failed to start Influx MCP server:', err);
  process.exit(1);
});
