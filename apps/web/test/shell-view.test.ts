import type { ShellState } from "@warroom/contracts";
import { describe, expect, test } from "vitest";
import {
  type ConnectionEvent,
  type ConnectionSnapshot,
  initialConnection,
  reduceConnection,
  shellScreen,
} from "../src/shell-view.ts";

const state: ShellState = {
  incidentId: "test-inc",
  conversationId: 7,
  user: { id: "alice", role: "IC" },
  sandbox: "up",
};

const play = (events: ConnectionEvent[]): ConnectionSnapshot =>
  events.reduce(reduceConnection, initialConnection);

describe("shell view", () => {
  test("connection states: connecting, connected, reconnecting", () => {
    expect(shellScreen(initialConnection)).toEqual({ kind: "connecting" });

    const live = play([{ type: "state", state }]);
    expect(shellScreen(live)).toEqual({ kind: "connected", state });

    const dropped = play([
      { type: "state", state },
      { type: "closed", close: { code: 1006, afterLive: true } },
    ]);
    expect(shellScreen(dropped)).toEqual({ kind: "reconnecting" });

    const retrying = reduceConnection(dropped, { type: "attempt" });
    expect(shellScreen(retrying)).toEqual({ kind: "reconnecting" });
  });

  test("connection states: a failed first attempt keeps showing Connecting", () => {
    const failed = play([{ type: "closed", close: { code: 1006, afterLive: false } }]);
    expect(shellScreen(failed)).toEqual({ kind: "connecting" });
  });

  test("unknown user: a refused connection links to the three seeded users", () => {
    const refused = play([{ type: "closed", close: { code: 1000, afterLive: false } }]);

    expect(shellScreen(refused)).toEqual({
      kind: "unknown-user",
      links: [
        { user: "alice", href: "?user=alice" },
        { user: "bob", href: "?user=bob" },
        { user: "carol", href: "?user=carol" },
      ],
    });
  });

  test("unknown user: a clean close after the shell was live is not a refusal", () => {
    const closed = play([
      { type: "state", state },
      { type: "closed", close: { code: 1000, afterLive: true } },
    ]);
    expect(shellScreen(closed)).toEqual({ kind: "reconnecting" });
  });
});
