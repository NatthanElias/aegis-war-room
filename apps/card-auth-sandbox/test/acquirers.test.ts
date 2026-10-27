import { describe, expect, test } from "vitest";
import { createAcquirers } from "../src/acquirers.ts";

describe("acquirers", () => {
  test("declines exactly the amounts whose last two cents digits are 51", async () => {
    // Zero jitter keeps the calls at their base latency.
    const acquirers = createAcquirers(() => 0);
    const amounts: Array<[number, string]> = [
      [51, "DECLINED"],
      [151, "DECLINED"],
      [1151, "DECLINED"],
      [100051, "DECLINED"],
      [1061, "APPROVED"],
      [1501, "APPROVED"],
      [510, "APPROVED"],
      [5100, "APPROVED"],
      [1500, "APPROVED"],
    ];
    expect(amounts).toHaveLength(9);

    for (const acquirer of ["acquirer-alpha", "acquirer-beta"] as const) {
      const decisions = await Promise.all(
        amounts.map(([amountCents]) => acquirers.call(acquirer, { traceId: "t", amountCents })),
      );
      expect(decisions, acquirer).toEqual(amounts.map(([, decision]) => decision));
    }
  });
});
