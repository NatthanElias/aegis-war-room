import { startSandbox } from "./server.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("card-auth-sandbox: DATABASE_URL is required");
  process.exit(1);
}

const sandbox = await startSandbox({ port: Number(process.env.PORT ?? 4000), databaseUrl });
console.log(`card-auth-sandbox listening on ${sandbox.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void sandbox.close().then(() => process.exit(0));
  });
}
