import { startServer } from "./server.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("warroom-server: DATABASE_URL is required");
  process.exit(1);
}

const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  incidentId: process.env.INCIDENT_ID ?? "demo",
  incidentsDir: process.env.INCIDENTS_DIR ?? "incidents",
  databaseUrl,
});
console.log(`warroom-server listening on ${server.port}, incident ${server.incidentId}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
