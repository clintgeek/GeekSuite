# InfluxDB MCP Server

This Model Context Protocol (MCP) server exposes your local InfluxDB instance to compatible clients (Cursor, Claude Desktop, etc.) so you can inspect Garmin data directly from your editor.

## Setup

1. Install dependencies:

```bash
cd tools/influx-mcp
npm install
```

2. Configure environment variables (copy `.env.example` and update host/IP as needed):

```env
INFLUXDB_PROTOCOL=http
INFLUXDB_HOST=datageek_influxdb
INFLUXDB_PORT=8086
INFLUXDB_USERNAME=admin
INFLUXDB_PASSWORD=csUK5dutiG5XGY
INFLUXDB_DATABASE=geekdata
```

> Tokens are not required for InfluxDB 1.x, but if you are on 2.x you can provide `INFLUXDB_TOKEN` and the server will prefer that for authentication.

3. Start the MCP server manually (optional sanity check):

```bash
npm start
```

You should see `Influx MCP server started.` in the terminal.

## Available tools

| Tool | Description |
| --- | --- |
| `influx.ping` | Ping the configured Influx host and return RTT/online status. |
| `influx.listMeasurements` | List all measurements present in the selected database. |
| `influx.describeMeasurement` | Return field/tag keys for a specific measurement. |
| `influx.query` | Run an arbitrary InfluxQL query (`SELECT`, `SHOW`, etc.) and return the raw rows. |

## Using inside MCP clients

Add an entry similar to the following to your MCP client configuration:

```json
{
  "mcpServers": {
    "influx": {
      "command": "/Users/ccrocker/.nvm/versions/node/v22.20.0/bin/node",
      "args": [
        "/Users/ccrocker/projects/fitnessGeek/tools/influx-mcp/server.js"
      ],
      "env": {
        "INFLUXDB_HOST": "192.168.1.17",
        "INFLUXDB_PORT": "8086",
        "INFLUXDB_USERNAME": "admin",
        "INFLUXDB_PASSWORD": "csUK5dutiG5XGY",
        "INFLUXDB_DATABASE": "geekdata"
      }
    }
  }
}
```

Restart your MCP-aware editor and you should be able to call the new tools to inspect data and wire it into fitnessGeek workflows.

If the editor reports "0 tools" or similar, open the MCP output panel to check for errors, or temporarily run the server manually to verify it registers the tool list.
