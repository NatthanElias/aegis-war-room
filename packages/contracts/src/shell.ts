import { hostNamed, remote } from "@earendil-works/chord";
import { type Static, Type } from "typebox";

export const ShellUserSchema = Type.Object({
  id: Type.Union([Type.Literal("alice"), Type.Literal("bob"), Type.Literal("carol")]),
  role: Type.Union([Type.Literal("IC"), Type.Literal("Responder"), Type.Literal("Observer")]),
});

export const SandboxStatusSchema = Type.Union([Type.Literal("up"), Type.Literal("down")]);

/** `warroom.shell` v1: what the browser shell shows. Later features add remote types beside it. */
export const Shell = remote("warroom.shell", {
  version: 1,
  input: Type.Object({}),
  host: hostNamed("server"),
  variants: {
    default: {
      state: {
        incidentId: Type.String(),
        conversationId: Type.Number(),
        user: ShellUserSchema,
        sandbox: SandboxStatusSchema,
      },
    },
  },
});

export interface ShellState {
  readonly incidentId: string;
  readonly conversationId: number;
  readonly user: Static<typeof ShellUserSchema>;
  readonly sandbox: Static<typeof SandboxStatusSchema>;
}
