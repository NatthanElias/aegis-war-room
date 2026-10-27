import { describe, expect, test } from "vitest";
import { routeBin } from "../src/routing.ts";

const VISA = { brand: "visa", acquirer: "acquirer-alpha" };
const MASTERCARD = { brand: "mastercard", acquirer: "acquirer-beta" };

describe("routing", () => {
  test("routes by BIN", () => {
    // Pinned from the plan's routing table, one row per Coverage member with each range edge and its neighbour.
    const table: Array<[string, unknown]> = [
      ["4", VISA],
      ["51", MASTERCARD],
      ["55", MASTERCARD],
      ["2221", MASTERCARD],
      ["2720", MASTERCARD],
      ["50", "unsupported_bin"],
      ["56", "unsupported_bin"],
      ["2220", "unsupported_bin"],
      ["2721", "unsupported_bin"],
      ["34", "unsupported_bin"],
      ["6011", "unsupported_bin"],
      ["", "unsupported_bin"],
      ["4x11", "unsupported_bin"],
    ];
    expect(table).toHaveLength(13);

    for (const [prefix, expected] of table) {
      expect(routeBin(prefix), `prefix "${prefix}"`).toEqual(expected);
    }
  });
});
