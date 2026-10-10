import { getSensorSnapshot, recordSensorEvent, type SensorEvent } from "../../../server/demo-store";

function isSensorEvent(value: unknown): value is SensorEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const validMetric = (event.sensor_type === "ldr" && event.metric === "brightness_pct" && event.unit === "%" && typeof event.value === "number" && event.value >= 0 && event.value <= 100)
    || (event.sensor_type === "dht11" && event.metric === "temperature_c" && event.unit === "°C" && typeof event.value === "number" && event.value >= 0 && event.value <= 50)
    || (event.sensor_type === "dht11" && event.metric === "humidity_pct" && event.unit === "%" && typeof event.value === "number" && event.value >= 0 && event.value <= 100);
  return validMetric
    && typeof event.sensor_id === "string" && event.sensor_id.trim().length > 0
    && typeof event.location === "string" && event.location.trim().length > 0
    && typeof event.value === "number" && Number.isFinite(event.value)
    && typeof event.observed_at === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(event.observed_at)
    && Number.isFinite(Date.parse(event.observed_at));
}

export async function GET() {
  return Response.json(getSensorSnapshot());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isSensorEvent(body)) {
    return Response.json({ error: "Expected a supported LDR brightness or DHT11 temperature/humidity event with a valid value, unit, location, sensor_id, and ISO timestamp." }, { status: 400 });
  }
  const event: SensorEvent = {
    sensor_id: body.sensor_id.trim(),
    sensor_type: body.sensor_type,
    metric: body.metric,
    value: body.value,
    unit: body.unit,
    location: body.location.trim(),
    observed_at: body.observed_at,
  };
  const result = recordSensorEvent(event);
  return Response.json(result, { status: 201 });
}
