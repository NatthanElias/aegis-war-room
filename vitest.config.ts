import { configDefaults, defineConfig } from "vitest/config";

const allTests = ["apps/*/test/**/*.test.ts", "scripts/test/**/*.test.ts"];
const slowAcquirerTests = ["apps/card-auth-sandbox/test/slow-acquirer.test.ts"];
const chaosDecoyTests = ["apps/card-auth-sandbox/test/chaos-decoy.test.ts"];
const timingTests = [...slowAcquirerTests, ...chaosDecoyTests];

export default defineConfig({
  test: {
    environment: "node",
    // Why: child-process and database tests wait on real timers (3 s retry windows, 5 s polls).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Hazard: other files' database drops force checkpoints that stall WAL fsync and distort the latency proofs.
    // Why: groups 1 and 2 run one after the other and after the parallel files, so no database drop overlaps a timing proof.
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
        test: { name: "isolated", include: slowAcquirerTests, sequence: { groupOrder: 1 } },
      },
      {
        extends: true,
        test: { name: "isolated-decoy", include: chaosDecoyTests, sequence: { groupOrder: 2 } },
      },
    ],
  },
});
