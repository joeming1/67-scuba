import { getSensorReadings } from "../../../server/demo-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sensorId = url.searchParams.get("sensor_id");
  const since = url.searchParams.get("since") ?? undefined;
  if (!sensorId) return Response.json({ error: "sensor_id is required." }, { status: 400 });
  return Response.json({ readings: getSensorReadings(sensorId, since) });
}
