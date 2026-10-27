import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/test/**/*.test.ts", "scripts/test/**/*.test.ts"],
    environment: "node",
    // Why: child-process and database tests wait on real timers (3 s retry windows, 5 s polls).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
