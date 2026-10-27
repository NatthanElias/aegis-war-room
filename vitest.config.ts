import { configDefaults, defineConfig } from "vitest/config";

const allTests = ["apps/*/test/**/*.test.ts", "scripts/test/**/*.test.ts"];
const timingTests = ["apps/card-auth-sandbox/test/slow-acquirer.test.ts"];

export default defineConfig({
  test: {
    environment: "node",
    // Why: child-process and database tests wait on real timers (3 s retry windows, 5 s polls).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Hazard: other files' database drops force checkpoints that stall WAL fsync and distort the latency proofs.
    // Why: group 1 runs after the parallel files, preserving real PostgreSQL and the approved timing thresholds.
    projects: [
      {
        extends: true,
        test: {
          name: "parallel",
          include: allTests,
          exclude: [...configDefaults.exclude, ...timingTests],
        },
      },
      {
        extends: true,
        test: { name: "isolated", include: timingTests, sequence: { groupOrder: 1 } },
      },
    ],
  },
});
