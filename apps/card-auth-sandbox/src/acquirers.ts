import type { AcquirerName } from "./routing.ts";

export type Decision = "APPROVED" | "DECLINED";

export interface AcquirerRequest {
  readonly traceId: string;
  readonly amountCents: number;
  /** Aborted when the sandbox closes, so a long fault delay does not hold shutdown. */
  readonly signal?: AbortSignal;
}

export interface Acquirers {
  call(acquirer: AcquirerName, request: AcquirerRequest): Promise<Decision>;
  /** Adds `ms` to every later call of `acquirer`. Only tests and in-process chaos set it; there is no HTTP route. */
  setDelay(acquirer: AcquirerName, ms: number): void;
}

const BASE_LATENCY_MS: Readonly<Record<AcquirerName, number>> = {
  "acquirer-alpha": 80,
  "acquirer-beta": 120,
};
const JITTER_MS = 40;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("acquirer call aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("acquirer call aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The two simulated gateways. An amount whose cents end in `51` is declined; every other amount is approved. */
export function createAcquirers(random: () => number = Math.random): Acquirers {
  const delays: Record<AcquirerName, number> = { "acquirer-alpha": 0, "acquirer-beta": 0 };
  return {
    async call(acquirer, request) {
      const latency = BASE_LATENCY_MS[acquirer] + random() * JITTER_MS + delays[acquirer];
      await sleep(latency, request.signal);
      return request.amountCents % 100 === 51 ? "DECLINED" : "APPROVED";
    },
    setDelay(acquirer, ms) {
      if (!Number.isFinite(ms) || ms < 0)
        throw new Error(`delay must be a non-negative number, got ${ms}`);
      delays[acquirer] = ms;
    },
  };
}
