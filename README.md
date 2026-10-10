# 67-scuba — FixFlow demo

This repository contains the shared API contract, the LDR/DHT11 sensor panel/simulator/ESP32 sender, local workflow API, and WorkBuddy MCP server.

## Local start

1. Install dependencies with `npm install`.
2. Start the Next.js app with `npm run dev`.
3. Open `http://localhost:3000` for the sensor demo page.
4. In a second terminal, run `npm run mcp` to start the MCP stdio server. Configure WorkBuddy using the stdio example in [`mcp/mcp.json.example`](mcp/mcp.json.example).

The local API currently uses process-memory storage. It resets on process restart and is intended for a single-process demo rehearsal. See [`server/README.md`](server/README.md), [`sensor/README.md`](sensor/README.md), and [`docs/DEMO_CONTRACT.md`](docs/DEMO_CONTRACT.md) for behavior and limitations.
