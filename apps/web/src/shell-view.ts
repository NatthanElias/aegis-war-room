import type { SeededUserId, ShellClose, ShellState } from "@warroom/contracts";

export interface ConnectionSnapshot {
  readonly phase: "connecting" | "live" | "closed";
  /** True once the shell has received its state at least once. */
  readonly hasBeenLive: boolean;
  readonly closeCode?: number;
  readonly state?: ShellState;
}

export type ConnectionEvent =
  | { readonly type: "attempt" }
  | { readonly type: "state"; readonly state: ShellState }
  | { readonly type: "closed"; readonly close: ShellClose };

export const initialConnection: ConnectionSnapshot = { phase: "connecting", hasBeenLive: false };

export function reduceConnection(
  snapshot: ConnectionSnapshot,
  event: ConnectionEvent,
): ConnectionSnapshot {
  switch (event.type) {
    case "attempt":
      return { phase: "connecting", hasBeenLive: snapshot.hasBeenLive };
    case "state":
      return { phase: "live", hasBeenLive: true, state: event.state };
    case "closed":
      return {
        phase: "closed",
        hasBeenLive: snapshot.hasBeenLive || event.close.afterLive,
        closeCode: event.close.code,
      };
  }
}

/**
 * The server refuses an unknown user by closing with code 1000 before any state arrives.
 * A network drop closes with another code, and a drop after the shell was live is not a refusal.
 */
export function isRefusal(snapshot: ConnectionSnapshot): boolean {
  return snapshot.phase === "closed" && !snapshot.hasBeenLive && snapshot.closeCode === 1000;
}

const SEEDED_IDS: readonly SeededUserId[] = ["alice", "bob", "carol"];

export type ShellScreen =
  | { readonly kind: "connecting" }
  | { readonly kind: "reconnecting" }
  | {
      readonly kind: "unknown-user";
      readonly links: readonly { readonly user: SeededUserId; readonly href: string }[];
    }
  | { readonly kind: "connected"; readonly state: ShellState };

export function shellScreen(snapshot: ConnectionSnapshot): ShellScreen {
  if (snapshot.phase === "live" && snapshot.state) {
    return { kind: "connected", state: snapshot.state };
  }
  if (isRefusal(snapshot)) {
    return {
      kind: "unknown-user",
      links: SEEDED_IDS.map((user) => ({ user, href: `?user=${user}` })),
    };
  }
  return snapshot.hasBeenLive ? { kind: "reconnecting" } : { kind: "connecting" };
}
