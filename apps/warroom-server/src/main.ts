import { resolveModels } from "./models.ts";
import { startServer } from "./server.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("warroom-server: DATABASE_URL is required");
  process.exit(1);
}

// Why: an unknown model ID in any agent's variable stops startup with the ID and the variable named, instead of
// failing on the first model call in the middle of an incident.
let setup: ReturnType<typeof resolveModels>;
try {
  setup = resolveModels(process.env);
} catch (error) {
  console.error(`warroom-server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
if (!setup.ready) console.log("Coordinator offline: OPENROUTER_API_KEY is not set");

// Context: compose passes every variable even when `.env` leaves it empty, so empty means unset.
const rateLimitText = process.env.WARROOM_ALERT_RATE_LIMIT?.trim();
const rateLimit = rateLimitText ? Number(rateLimitText) : undefined;
if (rateLimit !== undefined && !(Number.isInteger(rateLimit) && rateLimit >= 1)) {
  console.error(
    `warroom-server: WARROOM_ALERT_RATE_LIMIT must be a whole number of at least 1, got "${rateLimitText}"`,
  );
  process.exit(1);
}
const alertToken = process.env.WARROOM_ALERT_TOKEN || undefined;
if (alertToken === undefined) {
  console.log("Alert webhooks disabled: WARROOM_ALERT_TOKEN is not set");
}

const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  incidentId: process.env.INCIDENT_ID ?? "demo",
  incidentsDir: process.env.INCIDENTS_DIR ?? "incidents",
  sandboxUrl: process.env.SANDBOX_URL ?? "http://localhost:4000",
  databaseUrl,
  agents: { models: setup.models, agentModels: setup.agentModels },
  alerts: {
    token: alertToken,
    hmacSecret: process.env.WARROOM_GRAFANA_HMAC_SECRET || undefined,
    rateLimit,
  },
});
console.log(`warroom-server listening on ${server.port}, incident ${server.incidentId}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
