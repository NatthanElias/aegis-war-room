import { resolveChaosPort } from "./chaos.ts";
import { startSandbox } from "./server.ts";
import { resolveTrafficRate } from "./traffic.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("card-auth-sandbox: DATABASE_URL is required");
  process.exit(1);
}

let trafficRate: number;
let chaosPort: number | undefined;
try {
  trafficRate = resolveTrafficRate(process.env);
  chaosPort = resolveChaosPort(process.env);
} catch (error) {
  console.error(`card-auth-sandbox: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const sandbox = await startSandbox({
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  trafficRate,
  chaosPort,
});
console.log(`card-auth-sandbox listening on ${sandbox.port}`);
if (sandbox.chaosPort !== undefined) {
  console.log(`card-auth-sandbox chaos control on 127.0.0.1:${sandbox.chaosPort}`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void sandbox.close().then(() => process.exit(0));
  });
}
