import { type Host, local } from "@earendil-works/chord";
import { type Principal, SandboxStatusSchema } from "@warroom/contracts";
import { Type } from "typebox";

/**
 * Host-local state shared by every shell: the incident, its root conversation, and the sandbox status.
 * Context: it lives for the whole host lifetime, so all connected browsers see one sandbox poll.
 */
export const Runtime = local("warroom.runtime", {
  version: 1,
  input: Type.Object({}),
  members: {
    incidentId: Type.String(),
    conversationId: Type.Number(),
    sandbox: SandboxStatusSchema,
  },
});

export interface RuntimeConfig {
  readonly incidentId: string;
  readonly conversationId: number;
  readonly sandboxUrl: string;
  readonly sandboxPollMs: number;
  /** The first probe's result, taken before the server accepts connections so the first paint is not stale. */
  readonly initialSandbox: "up" | "down";
}

const SANDBOX_REQUEST_TIMEOUT_MS = 1500;

/** `up` only for a `200` from the sandbox `/healthz`; any other status, error, or timeout is `down`. */
export async function probeSandbox(
  sandboxUrl: string,
  signal: AbortSignal,
): Promise<"up" | "down"> {
  try {
    const response = await fetch(new URL("/healthz", sandboxUrl), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(SANDBOX_REQUEST_TIMEOUT_MS)]),
    });
    await response.body?.cancel();
    return response.status === 200 ? "up" : "down";
  } catch {
    return "down";
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** Serves `warroom.runtime` for the host's lifetime and polls the sandbox until the host closes. */
export function serveRuntime(host: Host<Principal>, config: RuntimeConfig): void {
  host.serve(
    Runtime,
    (_input, _principal, self) => {
      const incidentId = self.state("incidentId", Type.String(), config.incidentId);
      const conversationId = self.state("conversationId", Type.Number(), config.conversationId);
      const sandbox = self.state("sandbox", SandboxStatusSchema, config.initialSandbox);
      self.task(async (ctx) => {
        while (!ctx.signal.aborted) {
          const status = await probeSandbox(config.sandboxUrl, ctx.signal);
          if (!ctx.signal.aborted && status !== sandbox.value) sandbox.replace(ctx, status);
          await sleep(config.sandboxPollMs, ctx.signal);
        }
      });
      return { incidentId, conversationId, sandbox };
    },
    { lifetime: "host" },
  );
}
