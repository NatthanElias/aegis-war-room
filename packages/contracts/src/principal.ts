export type SeededUserId = "alice" | "bob" | "carol";
export type Role = "IC" | "Responder" | "Observer";

/** The authenticated Chord principal of a browser connection. */
export interface SeededUser {
  readonly id: SeededUserId;
  readonly role: Role;
}

/** The war room server's own principal: the identity of code that runs inside the host. */
export const SERVER_PRINCIPAL = { id: "server", role: "Server" } as const;

export type Principal = SeededUser | typeof SERVER_PRINCIPAL;

export const SEEDED_USERS: Readonly<Record<SeededUserId, SeededUser>> = {
  alice: { id: "alice", role: "IC" },
  bob: { id: "bob", role: "Responder" },
  carol: { id: "carol", role: "Observer" },
};

/** The seeded user named by a `user` query value, or undefined for anything else. */
export function resolveSeededUser(value: string | null | undefined): SeededUser | undefined {
  if (value === "alice" || value === "bob" || value === "carol") return SEEDED_USERS[value];
  return undefined;
}

export const principalKey = (principal: Principal): string => `${principal.id}:${principal.role}`;
